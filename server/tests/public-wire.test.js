import {test} from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {EventEmitter,once} from 'node:events'
import WebSocket from 'ws'
import {createBridge} from '../index.js'
import {createStore} from '../store.js'
import {METERS,parse,topicFor} from '../parse.js'
import {publicReading,publicSnapshot,publicEvent} from '../public-wire.js'

const secret='fixture-private-credential'
const packet=(sn,t)=>Buffer.from(JSON.stringify({SN:sn,timestamp:t,Datas:Array.from({length:3},()=>[230,10,2000,100,0,50,.9]),EA:{Reactive:{password:secret,SN:sn}}}))
function assertPrivate(value){const json=JSON.stringify(value);for(const m of METERS)assert.ok(!json.includes(m.sn),'hardware serial escaped the public boundary');assert.ok(!json.includes(secret),'private credential escaped the public boundary')}

test('public serializers allowlist telemetry fields and discard arbitrary payload or historical error text',()=>{
 const m=METERS[0],r=parse(m.sn,packet(m.sn,Date.now()))
 assert.equal(r.reactiveRaw,undefined)
 const reading=publicReading({...r,password:secret,reactiveRaw:{SN:m.sn,password:secret}})
 assert.equal(reading.sn,m.id);assert.equal(reading.pKw,6);assert.equal(reading.password,undefined);assert.equal(reading.reactiveRaw,undefined);assertPrivate(reading)
 const snap=publicSnapshot({broker:'CONNECTION_ERROR',reason:`mqtt://${secret}@example/${m.sn}`,now:Date.now(),staleAfterMs:120000,meters:[{...m,name:secret,latest:r,lastError:secret,status:'DISCONNECTED'}]})
 assertPrivate(snap);assert.equal(snap.meters[0].name,m.name)
 for(const kind of ['REJECTED','CONNECTION','VOLTAGE','UNKNOWN'])assertPrivate(publicEvent({id:1,sn:m.sn,t:Date.now(),kind,detail:`${m.sn} ${secret}`}))
})

test('HTTP and WebSocket use building IDs while all seven internal histories keep hardware identities',async()=>{
 const time=Date.now(),client=new EventEmitter(),store=createStore(':memory:')
 client.end=()=>{};client.subscribe=(topics,_options,cb)=>cb(null,topics.map(topic=>({topic,qos:0})))
 const bridge=createBridge({env:{MQTT_USERNAME:'fixture',MQTT_PASSWORD:secret},store,now:()=>time,mqttConnect:()=>client})
 const address=await bridge.start(0),base=`http://127.0.0.1:${address.port}`
 let ws
 try{
  client.emit('connect')
  for(const m of METERS)assert.equal(bridge.accept(topicFor(m.sn),packet(m.sn,time)),true)
  store.event(METERS[0].sn,'REJECTED',`${secret} ${METERS[0].sn}`,time)
  const snapshots=JSON.parse(store.db.prepare("SELECT data FROM bridge_state WHERE key='snapshot'").get().data)
  assert.equal(snapshots.meters[0].sn,METERS[0].sn)
  for(const m of METERS)assert.equal(store.latest(m.sn).sn,m.sn)
  const paths=['/api/status','/api/coverage','/api/events',...METERS.flatMap(m=>[`/api/history/${m.id}`,`/api/analytics/${m.id}`,`/api/forecast/${m.id}`,`/api/events?sn=${m.id}`])]
  for(const path of paths){const response=await fetch(base+path);assert.equal(response.status,200,path);const body=await response.json();assertPrivate(body);if(path.startsWith('/api/history/')){assert.equal(body.rows.length,1);assert.equal(body.rows[0].sn,body.sn)}}
  for(const path of [`/api/history/${METERS[0].sn}`,`/api/events?sn=${METERS[0].sn}`,`/api/history/main-transformer?from=oops`]){const response=await fetch(base+path);assert.equal(response.status,400);assertPrivate(await response.json())}
  ws=new WebSocket(base.replace('http:','ws:'));const messages=[];ws.on('message',message=>messages.push(JSON.parse(message)));await once(ws,'open')
  for(let i=0;i<50&&messages.length<2;i++)await new Promise(resolve=>setTimeout(resolve,10))
  assert.equal(messages.length,2);messages.forEach(assertPrivate)
  assert.equal(messages[0].meters[0].sn,METERS[0].id);assert.ok(messages[1].data[METERS[0].id])
 }finally{ws?.terminate();await bridge.close()}
})

test('development telemetry rejects DNS rebinding hosts, foreign origins, public binds and raw server errors',async()=>{
 const store=createStore(':memory:'),bridge=createBridge({env:{},store})
 await assert.rejects(()=>bridge.start(0,'0.0.0.0'),/loopback/)
 const address=await bridge.start(0),base=`http://127.0.0.1:${address.port}`
 try{
  const hostStatus=await new Promise((resolve,reject)=>{http.get(base+'/api/status',{headers:{Host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode)}).on('error',reject)})
  assert.equal(hostStatus,403)
  assert.equal((await fetch(base+'/api/status',{headers:{Origin:'https://attacker.example'}})).status,403)
  store.coverage=()=>{throw Error(`C:/private/${secret}/gml.sqlite`)}
  const failed=await fetch(base+'/api/coverage');assert.equal(failed.status,500);assertPrivate(await failed.json())
 }finally{await bridge.close()}
})
