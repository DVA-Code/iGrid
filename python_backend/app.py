"""WSGI API and static frontend, compatible with Passenger and the existing SQLite schema.
The MQTT subscriber is a separate process: never start a collector in a WSGI worker.
"""
import json, math, mimetypes, os, re, sqlite3, time
from pathlib import Path
from urllib.parse import parse_qs
from .config import ROOT, database_path, load_config
from .security import authorize, headers, is_https
METERS=json.loads((ROOT/'server/meters.json').read_text())
BY_SN={m['sn']:m for m in METERS}
BY_ID={m['id']:m for m in METERS}
OFFSET=20700000
class ClosingConnection(sqlite3.Connection):
    def __exit__(self,*args):
        try:return super().__exit__(*args)
        finally:self.close()
def now(): return int(time.time()*1000)
def db():
    path=database_path()
    path.parent.mkdir(parents=True,exist_ok=True)
    c=sqlite3.connect(path,timeout=5,factory=ClosingConnection);c.row_factory=sqlite3.Row
    c.executescript('''PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS readings(sn TEXT NOT NULL,t INTEGER NOT NULL,received INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(sn,t));
    CREATE INDEX IF NOT EXISTS readings_time ON readings(t);
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,sn TEXT,t INTEGER NOT NULL,kind TEXT NOT NULL,detail TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS bridge_state(key TEXT PRIMARY KEY,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS predictions(sn TEXT NOT NULL,t INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(sn,t));''')
    return c
def latest(c,sn):
    r=c.execute('SELECT data FROM readings WHERE sn=? ORDER BY t DESC LIMIT 1',(sn,)).fetchone()
    return json.loads(r['data']) if r else None
def coverage(c,sn):
    return dict(c.execute('SELECT MIN(t) AS first,MAX(t) AS last,COUNT(*) AS count,COUNT(DISTINCT CAST((t+20700000)/86400000 AS INTEGER)) AS days FROM readings WHERE sn=?',(sn,)).fetchone())
def snapshot(c):
    r=c.execute("SELECT data FROM bridge_state WHERE key='snapshot'").fetchone()
    saved=json.loads(r['data']) if r else {}
    active=now()-saved.get('now',0)<15000
    broker=saved.get('broker','COLLECTOR_OFFLINE') if active else 'COLLECTOR_OFFLINE'
    old={m['sn']:m for m in saved.get('meters',[])};meters=[]
    for m in METERS:
        prior=old.get(m['sn'],{});reading=latest(c,m['sn']);interval=prior.get('intervalSeconds')
        age=now()-min(reading['t'],reading['receivedAt']) if reading else math.inf
        status=broker if broker!='LIVE' else 'NO DATA' if not reading else 'STALE' if age>max(120000,(interval or 0)*3000) else 'LIVE'
        meters.append({**m,'latest':reading,'status':status,'count':prior.get('count',0),'intervalSeconds':interval,'lastError':prior.get('lastError')})
    return {'type':'snapshot','broker':broker,'reason':saved.get('reason','') if active else 'MQTT collector heartbeat expired; collector is not running or cannot update storage','now':now(),'staleAfterMs':120000,'meters':meters}
def history(c,sn,start,end,step):
    fields=['va','vb','vc','ia','ib','ic','pfa','pfb','pfc','pKw','freq']
    values=','.join(f"AVG(json_extract(data,'$.{f}')) AS {f}" for f in fields)
    sql=f'''SELECT CAST((t+20700000)/? AS INTEGER)*?-20700000 AS t,COUNT(*) AS n,MIN(t) AS first,MAX(t) AS last,MAX(received) AS receivedAt,{values} FROM readings WHERE sn=? AND t>=? AND t<=? GROUP BY 1 ORDER BY 1 LIMIT 10000'''
    return [{**dict(r),'sn':sn,'origin':'MEASURED','timeBasis':'aggregate'} for r in c.execute(sql,(step,step,sn,start,end))]
def analytics(c,sn,start,end):
    days={};previous=None;resets=0
    def day(t): return time.strftime('%Y-%m-%d',time.gmtime((t+OFFSET)/1000))
    def bucket(t,p):
        key=day(t)
        if key not in days:days[key]={'day':key,'kwh':0,'coveredHours':0,'peakKw':p,'samples':0}
        return days[key]
    for row in c.execute('SELECT data FROM readings WHERE sn=? AND t>=? AND t<=? ORDER BY t',(sn,start,end)):
        r=json.loads(row['data']);b=bucket(r['t'],r['pKw']);b['samples']+=1;b['peakKw']=max(b['peakKw'],r['pKw'])
        if previous:
            dt=r['t']-previous['t']
            if r.get('energyInKwh',0)<previous.get('energyInKwh',0):resets+=1
            if 0<dt<=360000:
                t=previous['t']
                while t<r['t']:
                    stop=min(r['t'],((t+OFFSET)//86400000+1)*86400000-OFFSET)
                    pa=previous['pKw']+(r['pKw']-previous['pKw'])*(t-previous['t'])/dt
                    pb=previous['pKw']+(r['pKw']-previous['pKw'])*(stop-previous['t'])/dt
                    b=bucket(t,pa);b['kwh']+=(pa+pb)/2*(stop-t)/3600000;b['coveredHours']+=(stop-t)/3600000;t=stop
        previous=r
    daily=sorted(days.values(),key=lambda d:d['day'])
    return {'sn':sn,'daily':daily,'kwh':sum(d['kwh'] for d in daily),'coveredHours':sum(d['coveredHours'] for d in daily),'resetCount':resets,'method':'Trapezoidal raw active power; gaps >6 min excluded; Nepal local days'}
def forecast(c,sn):
    t=now();rows=history(c,sn,t-7*86400000,t-3600000,60000);buckets=[[] for _ in range(24)];r=latest(c,sn)
    for x in rows:buckets[time.gmtime((x['t']+OFFSET)/1000).tm_hour].append(x['pKw'])
    span=(t-rows[0]['t'])/3600000 if rows else 0
    result={'generatedAt':t,'points':[],'model':'local-hour-profile-v1','coverageHours':span,'basis':'Insufficient fresh history: collect at least 24 hours with observations in every local hour.'}
    if r and t-r['t']<=360000 and span>=24 and all(buckets):
        means=[sum(a)/len(a) for a in buckets];h=time.gmtime((t+OFFSET)/1000).tm_hour;ratio=min(2,max(.5,r['pKw']/means[h])) if means[h]>0 else 1
        result.update(points=[{'t':t+k*900000,'p':means[time.gmtime((t+k*900000+OFFSET)/1000).tm_hour]*ratio} for k in range(1,13)],basis='Experimental local-hour profile adjusted to latest demand; compare with later observations.')
        c.execute('INSERT OR REPLACE INTO predictions VALUES(?,?,?)',(sn,t//600000*600000,json.dumps(result)));c.commit()
    result['savedForecasts']=c.execute('SELECT COUNT(*) FROM predictions WHERE sn=?',(sn,)).fetchone()[0]
    return result
READING_FIELDS=frozenset('t receivedAt origin timeBasis va vb vc ia ib ic pfa pfb pfc pKw freq energyInKwh energyOutKwh n first last quality datas'.split())
REASONS={
    'LIVE':'', 'NOT_CONFIGURED':'MQTT credentials are not configured on the server.',
    'CONNECTING':'Waiting for the broker connection and topic acknowledgements.',
    'DISCONNECTED':'The MQTT connection is closed; the physical cause is unverified.',
    'CONNECTION_ERROR':'MQTT connection failed; check the private server configuration and network.',
    'AUTH_FAILED':'The MQTT broker rejected authentication.',
    'SUBSCRIPTION_FAILED':'The broker did not acknowledge all required subscriptions.',
    'COLLECTOR_OFFLINE':'MQTT collector heartbeat expired; it is stopped or cannot update storage.',
    'STALE':'No recent valid reading; power, wiring and meter connectivity are unverified.',
    'NO DATA':'No valid reading has been received; the physical cause is unverified.',
    'STORAGE_ERROR':'The collector could not store a reading; check server storage.',
}

def public_reading(reading, meter_id):
    if not reading:return None
    result={'sn':meter_id}
    for k,v in reading.items():
        if k not in READING_FIELDS:continue
        if type(v) in (int,float) and math.isfinite(v):result[k]=v
        elif k=='origin' and v=='MEASURED':result[k]=v
        elif k=='timeBasis' and v in ('received','device','aggregate'):result[k]=v
        elif k=='quality' and isinstance(v,list):
            result[k]=[s for s in v if isinstance(s,str) and re.fullmatch(r'RECEPTION_TIME_ONLY|PHASE_[ABC]_(?:LOW|HIGH)_VOLTAGE',s)]
        elif k=='datas' and isinstance(v,list) and len(v)==3:
            if all(isinstance(a,list) and len(a)>=7 and all(type(n) in (int,float) and math.isfinite(n) for n in a[:7]) for a in v):result[k]=[a[:7] for a in v]
    return result

def public_snapshot(value):
    broker=value['broker'] if value['broker'] in REASONS else 'CONNECTION_ERROR'
    meters=[]
    for m in value['meters']:
        status=m['status'] if m['status'] in REASONS else 'CONNECTION_ERROR'
        meters.append({'sn':m['id'],'id':m['id'],'name':m['name'],'role':m['role'],
                       'latest':public_reading(m['latest'],m['id']),'status':status,
                       'count':m['count'],'intervalSeconds':m['intervalSeconds'],
                       'lastError':'A received payload was rejected by validation.' if m.get('lastError') else None})
    return {'type':'snapshot','broker':broker,'reason':REASONS[broker],
            'now':value['now'],'staleAfterMs':value['staleAfterMs'],'meters':meters}

def public_event(row):
    event=dict(row);meter=BY_SN.get(event.get('sn'))
    kind=event['kind'] if event['kind'] in ('CONNECTION','COUNTER_RESET','VOLTAGE','REJECTED') else 'EVENT'
    detail={'COUNTER_RESET':'The import energy counter decreased.',
            'VOLTAGE':'A measured phase voltage warning changed.',
            'REJECTED':'An incoming message did not pass validation.',
            'EVENT':'A telemetry event was recorded.'}.get(kind,'Telemetry connection state changed.')
    if kind=='CONNECTION':
        statuses=re.findall(r'COLLECTOR_OFFLINE|SUBSCRIPTION_FAILED|CONNECTION_ERROR|NOT_CONFIGURED|AUTH_FAILED|DISCONNECTED|CONNECTING|NO DATA|STALE|LIVE|UNKNOWN',event.get('detail',''))
        if statuses:detail=' → '.join(statuses[:2])
    return {'id':event['id'],'sn':meter['id'] if meter else None,'t':event['t'],'kind':kind,'detail':detail}

def integer(q,key,default,low=0,high=4102444800000):
    raw=str(q.get(key,[default])[0])
    if not re.fullmatch(r'\d{1,16}',raw):raise ValueError('Invalid number')
    value=int(raw)
    if not low<=value<=high:raise ValueError('Number out of range')
    return value

def api(path,q):
    exact={'/api/status':set(),'/api/coverage':set(),'/api/events':{'from','sn'}}
    match=re.fullmatch(r'/api/(history|analytics|forecast)/([a-z0-9-]+)',path)
    if path not in exact and not match:raise LookupError('Unknown endpoint')
    allowed=exact.get(path, set() if match and match[1]=='forecast' else {'from','to','range','step'})
    if set(q)-allowed or any(len(v)!=1 for v in q.values()):raise ValueError('Invalid parameters')
    with db() as c:
        # Bound CPU spent by any one query; response stays generic if the budget expires.
        deadline=time.monotonic()+3
        c.set_progress_handler(lambda: int(time.monotonic()>deadline),10000)
        if path=='/api/status':return public_snapshot(snapshot(c))
        if path=='/api/coverage':return {m['id']:coverage(c,m['sn']) for m in METERS}
        if path=='/api/events':
            meter_id=q.get('sn',[None])[0]
            if meter_id is not None and meter_id not in BY_ID:raise ValueError('Unknown meter')
            sn=BY_ID[meter_id]['sn'] if meter_id else None
            return {'events':[public_event(r) for r in c.execute('SELECT * FROM events WHERE t>=? AND (? IS NULL OR sn=?) ORDER BY t DESC LIMIT 200',(integer(q,'from',0),sn,sn))]}
        kind,meter_id=match.groups()
        if meter_id not in BY_ID:raise LookupError('Unknown meter')
        sn=BY_ID[meter_id]['sn']
        if kind=='forecast':return {**forecast(c,sn),'sn':meter_id}
        ranges={'6h':.25,'24h':1,'48h':2,'7d':7,'30d':30,'365d':365}
        span=ranges.get(q.get('range',['24h'])[0])
        if span is None:raise ValueError('Invalid range')
        end=integer(q,'to',now());start=integer(q,'from',max(0,end-int(span*86400000)))
        step=integer(q,'step',max(60000,int(span*60000)),1000,366*86400000)
        if end<=start or end-start>366*86400000:raise ValueError('Invalid history range')
        if kind=='analytics':return {**analytics(c,sn,start,end),'sn':meter_id}
        return {'rows':[public_reading(r,meter_id) for r in history(c,sn,start,end,step)],'coverage':coverage(c,sn)}
def application(environ,start_response):
    try:env=load_config()
    except (OSError,ValueError):env={}
    def respond(status,body,content='application/json',extra=()):
        if isinstance(body,str):body=body.encode('utf-8')
        start_response(status,headers(is_https(environ,env))+[('Content-Type',content),('Cache-Control','no-store'),('Content-Length',str(len(body)))]+list(extra))
        return [b'' if environ.get('REQUEST_METHOD')=='HEAD' else body]
    access=authorize(environ,env)
    if access:
        status,message,extra=access
        return respond(status,json.dumps({'error':message}),extra=extra)
    path=environ.get('PATH_INFO','/')
    if len(path)>2048 or len(environ.get('QUERY_STRING',''))>2048 or '\\' in path or '\x00' in path:
        return respond('400 Bad Request','{"error":"Invalid request"}')
    if path=='' and environ.get('SCRIPT_NAME'):
        mount=environ['SCRIPT_NAME']
        if not re.fullmatch(r'/[a-zA-Z0-9/_-]*',mount):return respond('400 Bad Request','{"error":"Invalid mount"}')
        return respond('301 Moved Permanently','',extra=[('Location',mount+'/')])
    if environ.get('REQUEST_METHOD') not in ('GET','HEAD'):
        return respond('405 Method Not Allowed','{"error":"Read only"}',extra=[('Allow','GET, HEAD')])
    if path.startswith('/api/'):
        try:body=json.dumps(api(path,parse_qs(environ.get('QUERY_STRING',''),keep_blank_values=True,max_num_fields=12)),allow_nan=False).encode();status='200 OK'
        except LookupError:body=b'{"error":"Not found"}';status='404 Not Found'
        except (ValueError,TypeError,OverflowError):body=b'{"error":"Invalid request"}';status='400 Bad Request'
        except (sqlite3.Error,OSError):body=b'{"error":"Storage unavailable or query limit reached"}';status='503 Service Unavailable'
        return respond(status,body)
    public=(ROOT/'dist').resolve();file=(public/path.lstrip('/')).resolve()
    if path=='/':file=public/'index.html'
    if (not file.is_relative_to(public) or not file.is_file() or
        any(p.startswith('.') for p in Path(path).parts) or
        any(p.startswith('.') for p in file.relative_to(public).parts) or file.suffix in ('.map','.env','.sqlite','.py')):
        return respond('404 Not Found','{"error":"Not found"}')
    try:return respond('200 OK',file.read_bytes(),mimetypes.guess_type(file)[0] or 'application/octet-stream')
    except OSError:return respond('404 Not Found','{"error":"Not found"}')
if __name__=='__main__':
    from wsgiref.simple_server import make_server
    os.environ['GML_MODE']='local'
    print('GML Python API and built frontend: http://127.0.0.1:8788')
    with make_server('127.0.0.1',8788,application) as server:server.serve_forever()
