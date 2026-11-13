"""Run one persistent subscriber separately from Passenger: python -m python_backend.collector."""
import argparse,hashlib,json,math,os,re,signal,sqlite3,threading,time,uuid
from pathlib import Path
from .app import ROOT,METERS,BY_SN,db,latest,now
from .config import load_config
from .runtime import CollectorLock
def config():
    return load_config()
def parse(sn,payload,retained=False):
    if retained:raise ValueError('Retained message: measurement age unverified')
    if len(payload)>65536:raise ValueError('Oversized MQTT payload')
    try:j=json.loads(payload)
    except (ValueError,UnicodeError):raise ValueError('Malformed JSON payload') from None
    if not isinstance(j,dict):raise ValueError('Expected a JSON object')
    if not isinstance(j.get('SN'),str) or j['SN'].upper()!=sn:raise ValueError('Topic and payload identity differ')
    rows=j.get('Datas')
    if not isinstance(rows,list) or len(rows)!=3:raise ValueError('Expected three phase arrays')
    data=[]
    for row in rows:
        if not isinstance(row,list) or len(row)<7:raise ValueError('Seven numeric phase fields required')
        a=[]
        for x in row[:7]:
            if isinstance(x,str) and re.fullmatch(r'-?\d+(?:\.\d+)?',x):x=float(x)
            if type(x) not in (int,float) or not math.isfinite(x):raise ValueError('Invalid numeric measurement')
            a.append(x)
        v,i,p,ei,eo,hz,pf=a
        if not(0<=v<=600 and 0<=i<=10000 and abs(p)<=6000000 and ei>=0 and eo>=0 and 0<=hz<=100 and abs(pf)<=1):raise ValueError('Measurement outside valid range')
        data.append(a)
    t=now();flags=['RECEPTION_TIME_ONLY']
    if 'timestamp' in j:
        from datetime import datetime,timezone
        stamp=j['timestamp']
        if type(stamp) in (int,float):t=stamp
        else:
            if not isinstance(stamp,str):raise ValueError('Invalid device timestamp')
            try:parsed=datetime.fromisoformat(stamp.replace('Z','+00:00'))
            except ValueError:raise ValueError('Invalid device timestamp') from None
            if parsed.tzinfo is None:raise ValueError('Device timestamp lacks timezone')
            t=parsed.astimezone(timezone.utc).timestamp()*1000
        if not math.isfinite(t) or t<946684800000 or t>now()+60000:raise ValueError('Invalid device timestamp')
        flags=[]
    r={'sn':sn,'t':int(t),'receivedAt':now(),'origin':'MEASURED','timeBasis':'received' if flags else 'device','datas':data,'quality':flags}
    for i,p in enumerate('abc'):
        r['v'+p],r['i'+p],r['pf'+p]=data[i][0],data[i][1],data[i][6]
        if data[i][0]<40:flags.append(f'PHASE_{p.upper()}_LOW_VOLTAGE')
        if data[i][0]>260:flags.append(f'PHASE_{p.upper()}_HIGH_VOLTAGE')
    r.update(pKw=sum(x[2] for x in data)/1000,energyInKwh=sum(x[3] for x in data),energyOutKwh=sum(x[4] for x in data),freq=sum(x[5] for x in data)/3)
    return r
def main():
    parser=argparse.ArgumentParser(description='One persistent GML MQTT collector')
    parser.add_argument('--instance',default='manual')
    parser.add_argument('--local',action='store_true',help='Use local development server/.env')
    args=parser.parse_args()
    if args.local:os.environ['GML_MODE']='local'
    os.umask(0o077)
    import paho.mqtt.client as mqtt
    env=config();state={'broker':'NOT_CONFIGURED','reason':'MQTT credentials missing'};counts={};intervals={};errors={};hashes={};statuses={}
    # Prevent duplicate collectors on the Linux cPanel host.
    lock=CollectorLock(args.instance)
    stopped=threading.Event()
    signal.signal(signal.SIGTERM,lambda *_:stopped.set())
    signal.signal(signal.SIGINT,lambda *_:stopped.set())
    subscription={'mid':None}
    def memory():
        with db() as c:
            meters=[{**m,'latest':latest(c,m['sn']),'count':counts.get(m['sn'],0),'lastError':errors.get(m['sn']),'intervalSeconds':sum(intervals[m['sn']])/len(intervals[m['sn']])/1000 if intervals.get(m['sn']) else None} for m in METERS]
            for m in meters:
                r=m['latest'];age=now()-min(r['t'],r['receivedAt']) if r else math.inf
                status=state['broker'] if state['broker']!='LIVE' else 'NO DATA' if not r else 'STALE' if age>max(120000,(m['intervalSeconds'] or 0)*3000) else 'LIVE'
                if statuses.get(m['sn'])!=status:
                    c.execute('INSERT INTO events(sn,t,kind,detail) VALUES(?,?,?,?)',(m['sn'],now(),'CONNECTION',str(statuses.get(m['sn'],'UNKNOWN'))+' → '+status));statuses[m['sn']]=status
            c.execute("INSERT OR REPLACE INTO bridge_state VALUES('snapshot',?)",(json.dumps({'type':'snapshot',**state,'now':now(),'staleAfterMs':120000,'meters':meters}),))
    client=mqtt.Client(mqtt.CallbackAPIVersion.VERSION2,client_id='gml-python-'+uuid.uuid4().hex[:12])
    def connected(c,u,flags,reason,properties):
        subscription['mid']=None
        if reason.is_failure:
            state.update(broker='AUTH_FAILED' if reason.value in (134,135) else 'CONNECTION_ERROR',reason='Broker rejected connection');return
        state.update(broker='CONNECTING',reason='Waiting for seven topic acknowledgements')
        result,mid=c.subscribe([(f"device/{m['sn']}/realtime",0) for m in METERS])
        if result!=mqtt.MQTT_ERR_SUCCESS:state.update(broker='SUBSCRIPTION_FAILED',reason='Subscription request could not be sent')
        else:subscription['mid']=mid
    def subscribed(c,u,mid,reasons,properties):
        if mid!=subscription['mid']:return
        valid=len(reasons)==len(METERS) and all(not r.is_failure for r in reasons)
        state.update(broker='LIVE' if valid else 'SUBSCRIPTION_FAILED',reason='' if valid else 'Not all required topics were acknowledged')
    def disconnected(c,u,flags,reason,properties):
        subscription['mid']=None
        if state['broker']!='AUTH_FAILED':state.update(broker='DISCONNECTED',reason='MQTT connection closed; physical cause unverified')
    def received(c,u,msg):
        parts=msg.topic.split('/');sn=parts[1].upper() if len(parts)==3 and parts[0]=='device' and parts[2]=='realtime' else ''
        if sn not in BY_SN:return
        try:
            digest=hashlib.sha256(msg.payload).hexdigest()
            if msg.dup and hashes.get(sn)==digest:return
            r=parse(sn,msg.payload,msg.retain)
            with db() as sql:
                previous=latest(sql,sn)
                if previous and r['t']<=previous['t']:return
                sql.execute('INSERT OR IGNORE INTO readings VALUES(?,?,?,?)',(sn,r['t'],r['receivedAt'],json.dumps(r)))
                if previous:
                    dt=r['receivedAt']-previous['receivedAt']
                    if 0<dt<=240000:intervals[sn]=(intervals.get(sn,[])+[dt])[-30:]
                    if r['energyInKwh']<previous.get('energyInKwh',0):sql.execute('INSERT INTO events(sn,t,kind,detail) VALUES(?,?,?,?)',(sn,now(),'COUNTER_RESET','Import energy counter decreased'))
                warnings=[x for x in r['quality'] if 'VOLTAGE' in x];old=[x for x in (previous or {}).get('quality',[]) if 'VOLTAGE' in x]
                if warnings!=old:sql.execute('INSERT INTO events(sn,t,kind,detail) VALUES(?,?,?,?)',(sn,now(),'VOLTAGE',','.join(warnings) or 'Voltage warning cleared'))
            counts[sn]=counts.get(sn,0)+1;hashes[sn]=digest;errors.pop(sn,None)
        except (ValueError,TypeError,KeyError,OverflowError):
            errors[sn]='Incoming message failed validation'
            with db() as sql:sql.execute('INSERT INTO events(sn,t,kind,detail) VALUES(?,?,?,?)',(sn,now(),'REJECTED',errors[sn]))
        except sqlite3.Error:
            state.update(broker='STORAGE_ERROR',reason='Incoming reading could not be stored')
    client.on_connect=connected;client.on_subscribe=subscribed;client.on_disconnect=disconnected;client.on_message=received
    if env.get('MQTT_TLS')!='true' and env.get('GML_MODE')!='local' and env.get('MQTT_ALLOW_INSECURE')!='true':
        state.update(broker='NOT_CONFIGURED',reason='Unencrypted MQTT is disabled until explicitly accepted')
    elif env.get('MQTT_USERNAME') and env.get('MQTT_PASSWORD'):
        client.username_pw_set(env['MQTT_USERNAME'],env['MQTT_PASSWORD'])
        if env.get('MQTT_TLS')=='true':client.tls_set()
        client.reconnect_delay_set(3,30);state.update(broker='CONNECTING',reason='Connecting to MQTT broker')
        client.on_connect_fail=lambda c,u:state.update(broker='CONNECTION_ERROR',reason='MQTT network connection failed; DNS, routing or service cause unverified')
        client.connect_async(env.get('MQTT_HOST','mqtt.iammeter.com'),int(env.get('MQTT_PORT','1883')),60);client.loop_start()
    print('GML collector running; credentials are never printed',flush=True)
    last_state=None
    try:
        while not stopped.is_set():
            memory()
            current=state['broker']
            if current!=last_state:
                with db() as sql:sql.execute('INSERT INTO events(sn,t,kind,detail) VALUES(NULL,?,?,?)',(now(),'CONNECTION',current+': '+state['reason']))
                last_state=current;print('MQTT:',current,flush=True)
            stopped.wait(5)
    except KeyboardInterrupt:pass
    finally:
        client.disconnect();client.loop_stop();state.update(broker='COLLECTOR_OFFLINE',reason='Collector stopped');memory();lock.close()
if __name__=='__main__':
    try:main()
    except (ValueError,OSError,RuntimeError):
        print('Collector could not start. Check private configuration, permissions and collector status.',flush=True)
        raise SystemExit(1) from None
