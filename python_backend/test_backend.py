import json,os,tempfile,unittest
from unittest.mock import patch
from . import app
from .collector import parse
class BackendTests(unittest.TestCase):
 def setUp(self):
  self.config=patch.dict(os.environ,{'GML_MODE':'production','GML_ACCESS':'public'});self.config.start()
  self.temp=tempfile.TemporaryDirectory();self.previous=os.environ.get('GML_DB');os.environ['GML_DB']=self.temp.name+'/history.sqlite'
 def tearDown(self):
  if self.previous is None:os.environ.pop('GML_DB',None)
  else:os.environ['GML_DB']=self.previous
  self.temp.cleanup()
  self.config.stop()
 def payload(self,sn,t):return json.dumps({'SN':sn,'timestamp':t,'Datas':[['230','10','2000','100','0','50','0']]*3}).encode()
 def test_seven_streams_reopen_and_never_claim_live_without_collector(self):
  t=app.now()-1000
  with app.db() as c:
   for sn in app.BY_SN:
    r=parse(sn,self.payload(sn,t));self.assertEqual(r['pfa'],0);c.execute('INSERT INTO readings VALUES(?,?,?,?)',(sn,r['t'],r['receivedAt'],json.dumps(r)))
  with app.db() as c:
   self.assertEqual(len(app.snapshot(c)['meters']),7);self.assertEqual(app.snapshot(c)['broker'],'COLLECTOR_OFFLINE')
   c.execute("INSERT INTO bridge_state VALUES('snapshot',?)",(json.dumps({'broker':'LIVE','now':app.now(),'meters':[]}),));c.commit()
   self.assertTrue(all(m['status']=='LIVE' for m in app.snapshot(c)['meters']))
   self.assertEqual(app.coverage(c,next(iter(app.BY_SN)))['count'],1)
 def test_rejects_identity_retained_and_future(self):
  sn=next(iter(app.BY_SN))
  for payload,retained in [(self.payload('wrong',app.now()),False),(self.payload(sn,app.now()),True),(self.payload(sn,app.now()+120000),False)]:
   with self.assertRaises(ValueError):parse(sn,payload,retained)
 def test_history_forecast_persistence_and_wsgi_mount(self):
  sn=next(iter(app.BY_SN));t=app.now()
  with app.db() as c:
   for i in range(31*60):
    r=parse(sn,self.payload(sn,t-(31*60-i)*60000));c.execute('INSERT INTO readings VALUES(?,?,?,?)',(sn,r['t'],r['receivedAt'],json.dumps(r)))
   c.commit();result=app.forecast(c,sn);self.assertEqual(len(result['points']),12);self.assertEqual(result['savedForecasts'],1)
  with app.db() as c:self.assertEqual(c.execute('SELECT COUNT(*) FROM predictions').fetchone()[0],1)
  status=[];body=app.application({'wsgi.url_scheme':'https','PATH_INFO':'/api/history/'+app.BY_SN[sn]['id'],'SCRIPT_NAME':'/research','REQUEST_METHOD':'GET','QUERY_STRING':'range=48h'},lambda s,h:status.append(s))
  self.assertEqual(status,['200 OK']);self.assertGreater(len(json.loads(b''.join(body))['rows']),100)
  status=[];app.application({'wsgi.url_scheme':'https','PATH_INFO':'/../server/.env','REQUEST_METHOD':'GET'},lambda s,h:status.append(s));self.assertEqual(status,['404 Not Found'])
 def test_public_security_boundary(self):
  history_status=[]
  app.application({'PATH_INFO':'/api/history/main-transformer','QUERY_STRING':'range=6h','REQUEST_METHOD':'GET','wsgi.url_scheme':'https'},lambda s,h:history_status.append(s))
  self.assertEqual(history_status,['200 OK'])
  for path,scheme,expected in [('/api/status','http','403 Forbidden'),('/server/meters.json','https','404 Not Found'),('/.env','https','404 Not Found'),('/api/status','https','200 OK')]:
   status=[];body=b''.join(app.application({'PATH_INFO':path,'REQUEST_METHOD':'GET','wsgi.url_scheme':scheme},lambda s,h:status.append(s)))
   self.assertEqual(status,[expected])
   for sn in app.BY_SN:self.assertNotIn(sn.encode(),body)
if __name__=='__main__':unittest.main()
