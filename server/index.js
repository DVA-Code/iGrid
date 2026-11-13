import dotenv from 'dotenv'
import http from 'node:http'
import {randomUUID,createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import mqtt from 'mqtt'
import {WebSocketServer} from 'ws'
import {METERS,parse,topicFor} from './parse.js'
import {createStore} from './store.js'
import {predict} from './prediction.js'
import {mqttReason} from './diagnostics.js'
import {resolvePublicMeter,publicReading,publicSnapshot,publicEvent,publicCoverage,publicForecast,publicMessage} from './public-wire.js'
dotenv.config({path:new URL('./.env',import.meta.url)})
export function createBridge({env=process.env,store=createStore(),mqttConnect=mqtt.connect,now=Date.now}={}){
 const staleMs=Math.max(1000,Number(env.STALE_AFTER_S||120)*1000)
 const origins=new Set((env.ALLOWED_ORIGINS||'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000').split(',').map(s=>s.trim()))
 let broker='NOT_CONFIGURED',reason='MQTT credentials missing',client=null,timer=null,lastMemoryWrite=0,connectionEpoch=0
 const state=new Map(METERS.map(m=>[m.sn,{meter:m,latest:store.latest(m.sn),count:0,lastError:null,intervals:[],status:'NO DATA',lastHash:null}]))
 const canOrigin=o=>!o||origins.has(o)
 const canHost=host=>typeof host==='string'&&/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host)
 const freshness=s=>Math.max(staleMs,s.intervals.length?Math.max(...s.intervals.slice(-10))*3:0)
 function status(s){if(broker!=='LIVE')return broker;if(!s.latest)return'NO DATA';return now()-Math.min(s.latest.t,s.latest.receivedAt)>freshness(s)?'STALE':'LIVE'}
 const snapshot=()=>({type:'snapshot',broker,reason,now:now(),staleAfterMs:staleMs,meters:[...state.values()].map(s=>({...s.meter,latest:s.latest,count:s.count,lastError:s.lastError,quality:s.latest?.quality||[],status:status(s),intervalSeconds:s.intervals.length?s.intervals.reduce((a,b)=>a+b,0)/s.intervals.length/1000:null}))})
 const send=(c,d)=>{if(c.readyState===1&&c.bufferedAmount<2e6)c.send(JSON.stringify(publicMessage(d)))}
 const broadcast=d=>wss.clients.forEach(c=>send(c,d))
 const event=(sn,kind,detail)=>{const e=store.event(sn,kind,detail,now());broadcast({type:'event',data:e});return e}
 function refresh(){for(const[sn,s]of state){const next=status(s);if(next!==s.status){event(sn,'CONNECTION',`${s.status} → ${next}`);s.status=next}}const snap=snapshot();if(now()-lastMemoryWrite>5000){store.bridge(snap);lastMemoryWrite=now()}broadcast(snap)}
 function accept(topic,payload,packet={}){
  const match=/^device\/([A-Za-z0-9]+)\/realtime$/.exec(topic)
  if(!match||!state.has(match[1].toUpperCase()))return false
  const sn=match[1].toUpperCase(),s=state.get(sn)
  try{
   const hash=createHash('sha256').update(payload).digest('hex');if(packet.dup&&hash===s.lastHash)return false
   const r=parse(sn,payload,{receivedAt:now(),retained:packet.retain})
   if(s.latest&&r.t<=s.latest.t){store.record(r);return false}if(!store.record(r))return false
   if(s.latest){const gap=r.receivedAt-s.latest.receivedAt;if(gap>0&&gap<=staleMs*2)s.intervals=[...s.intervals,gap].slice(-30)
    if(r.energyInKwh<s.latest.energyInKwh||r.energyOutKwh<s.latest.energyOutKwh)event(sn,'COUNTER_RESET','Energy counter decreased; negative counter delta excluded')}
   const old=(s.latest?.quality||[]).filter(x=>x.includes('VOLTAGE')).join(','),flags=r.quality.filter(x=>x.includes('VOLTAGE')).join(',')
   if(old!==flags)event(sn,'VOLTAGE',flags||'Voltage warning cleared; not an equipment fault diagnosis')
   s.latest=r;s.count++;s.lastError=null;s.lastHash=hash;broadcast({type:'reading',data:r});refresh();return true
  }catch(e){s.lastError=e.message;event(sn,'REJECTED',e.message);return false}
 }
 const server=http.createServer((req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff')
  if(!canHost(req.headers.host)){res.writeHead(403);return res.end('{"error":"Host not allowed"}')}
  if(!canOrigin(req.headers.origin)){res.writeHead(403);return res.end('{"error":"Origin not allowed"}')}
  if(req.headers.origin)res.setHeader('Access-Control-Allow-Origin',req.headers.origin);res.setHeader('Vary','Origin')
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}if(req.method!=='GET'){res.writeHead(405);return res.end('{"error":"Read-only endpoint"}')}
  try{const u=new URL(req.url,'http://localhost');let data
   const badRequest=message=>{const error=new Error(message);error.publicMessage=message;throw error}
   const resolve=id=>{const meter=resolvePublicMeter(id);if(!meter)badRequest('Unknown building');return meter}
   if(u.pathname==='/api/status')data=publicSnapshot(snapshot())
   else if(u.pathname==='/api/coverage')data=Object.fromEntries(METERS.map(m=>[m.id,publicCoverage(store.coverage(m.sn))]))
   else if(u.pathname==='/api/events'){const id=u.searchParams.get('sn'),from=Number(u.searchParams.get('from')||0);if(!Number.isFinite(from)||from<0)badRequest('Invalid event interval');data={events:store.events(from,now(),id?resolve(id).sn:null).map(publicEvent)}}
   else if(u.pathname.startsWith('/api/forecast/')){const m=resolve(u.pathname.split('/').at(-1)),sn=m.sn;data=publicForecast(store.prediction(sn,predict(store.query(sn,now()-7*86400000,now(),60000),state.get(sn).latest,now())),m.id)}
   else if(/^\/api\/(history|analytics)\//.test(u.pathname)){
    const m=resolve(u.pathname.split('/').at(-1)),sn=m.sn
    const days={'6h':.25,'24h':1,'48h':2,'7d':7,'30d':30,'365d':365}[u.searchParams.get('range')]||1
    const to=Number(u.searchParams.get('to')||now()),from=Number(u.searchParams.get('from')||(to-days*86400000))
    if(![from,to].every(Number.isFinite)||to<=from||to-from>366*86400000)badRequest('Invalid range; maximum 366 days')
    const step=Math.max(1000,Number(u.searchParams.get('step')||Math.max(60000,days*60000)))
    if(!Number.isFinite(step))badRequest('Invalid history interval')
    data=u.pathname.includes('/analytics/')?{...store.analytics(sn,from,to,freshness(state.get(sn))),sn:m.id}:{sn:m.id,from,to,step,rows:store.query(sn,from,to,step).map(publicReading),coverage:publicCoverage(store.coverage(sn))}
   }else{res.writeHead(404);return res.end('{"error":"Not found"}')}res.end(JSON.stringify(data))
  }catch(e){res.writeHead(e.publicMessage?400:500);res.end(JSON.stringify({error:e.publicMessage||'Telemetry request failed; server storage or service error'}))}
 })
 const wss=new WebSocketServer({noServer:true,maxPayload:65536})
 server.on('upgrade',(req,socket,head)=>{if(!canHost(req.headers.host)||!canOrigin(req.headers.origin)){socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');return}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req))})
 wss.on('connection',c=>{send(c,snapshot());send(c,{type:'history',data:Object.fromEntries(METERS.map(m=>[m.sn,store.query(m.sn,now()-6*3600000,now(),60000)]))})})
 function startMqtt(){
  if(!env.MQTT_PASSWORD||env.MQTT_PASSWORD.includes('PUT_YOUR')||!env.MQTT_USERNAME){broker='NOT_CONFIGURED';refresh();return}
  const host=env.MQTT_HOST||'mqtt.iammeter.com',tls=env.MQTT_TLS==='true',port=Number(env.MQTT_PORT||(tls?8883:1883))
  broker='CONNECTING';reason='Waiting for MQTT broker acknowledgement';refresh()
  // Subscribe once ourselves on every connection. MQTT.js automatic resubscription
  // would make the extra subscribe callback return [] for cached topics.
  client=mqttConnect(`${tls?'mqtts':'mqtt'}://${host}:${port}`,{username:env.MQTT_USERNAME,password:env.MQTT_PASSWORD,clientId:`gml-${randomUUID().slice(0,12)}`,clean:true,resubscribe:false,connectTimeout:10000,reconnectPeriod:3000,rejectUnauthorized:true})
  client.on('connect',()=>{
   const epoch=++connectionEpoch
   broker='CONNECTING';reason='Waiting for seven MQTT topic acknowledgements';refresh()
   client.subscribe(METERS.map(m=>topicFor(m.sn)),{qos:0},(e,granted)=>{
    if(epoch!==connectionEpoch)return
    const complete=Array.isArray(granted)&&METERS.every(m=>granted.some(g=>g.topic===topicFor(m.sn)&&g.qos>=0&&g.qos<=2))
    broker=e||!complete?'SUBSCRIPTION_FAILED':'LIVE';reason=broker==='LIVE'?'':'MQTT broker did not approve all seven meter topic subscriptions';refresh()
   })
  })
  client.on('message',accept);client.on('offline',()=>{connectionEpoch++;broker='DISCONNECTED';if(!reason||reason.startsWith('Waiting'))reason='MQTT connection closed; cause unverified';refresh()});client.on('close',()=>{connectionEpoch++;broker='DISCONNECTED';if(!reason||reason.startsWith('Waiting'))reason='MQTT connection closed; cause unverified';refresh()});client.on('error',e=>{broker='CONNECTION_ERROR';reason=mqttReason(e);refresh()})
 }
 return{server,store,accept,snapshot,refresh,startMqtt,
  async start(port=Number(env.PORT||8787),host=env.HOST||'127.0.0.1'){if(!['127.0.0.1','::1','localhost'].includes(host))throw new Error('The development telemetry service must bind to loopback; use the authenticated Python application for deployment');await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve)});startMqtt();timer=setInterval(refresh,1000);return server.address()},
  async close(){clearInterval(timer);client?.removeAllListeners();client?.end(true);wss.clients.forEach(c=>c.terminate());await new Promise(r=>wss.close(r));await new Promise(r=>server.close(r));store.close()}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const b=createBridge(),a=await b.start();console.log(`GML MQTT bridge http://${a.address}:${a.port} · SQLite history enabled`)
 console.log(`Broker state: ${b.snapshot().broker}. Monitor: npm run check`)
 let last='';const logState=setInterval(()=>{const s=b.snapshot(),key=`${s.broker}|${s.reason}`;if(key!==last){console.log(`MQTT ${s.broker}${s.reason?': '+s.reason:''}`);last=key}},1000)
 if(b.snapshot().broker==='NOT_CONFIGURED')console.log('Enter MQTT credentials privately in server/.env; restart the bridge. No live data is being claimed.')
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{clearInterval(logState);b.close().then(()=>process.exit(0))})
}
