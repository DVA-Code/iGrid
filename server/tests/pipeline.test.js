import {test} from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter,once} from 'node:events'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createServer} from 'node:net'
import mqtt from 'mqtt'
import mqttPacket from 'mqtt-packet'
import WebSocket from 'ws'
import {parse,METERS,topicFor} from '../parse.js'
import {createStore} from '../store.js'
import {createBridge} from '../index.js'
import {mqttReason} from '../diagnostics.js'
const sample=(sn,t,strings=false)=>JSON.stringify({SN:sn,timestamp:t,Datas:Array.from({length:3},()=>[230,10,2000,100,0,50,0].map(x=>strings?String(x):x))})
test('official numeric and observed legacy decimal-string payloads preserve zero PF',()=>{for(const strings of [false,true]){const r=parse(METERS[0].sn,sample(METERS[0].sn,Date.now(),strings));assert.equal(r.pfa,0);assert.equal(r.pKw,6);assert.equal(r.energyInKwh,300)}})
test('rejects mismatched identity, retained data, malformed numerics and future timestamp',()=>{const sn=METERS[0].sn;assert.throws(()=>parse(sn,sample(METERS[1].sn,Date.now())),/SN/);assert.throws(()=>parse(sn,sample(sn,Date.now()),{retained:true}),/Retained/);assert.throws(()=>parse(sn,sample(sn,Date.now()).replace('230','null')),/numeric/);assert.throws(()=>parse(sn,sample(sn,Date.now()+120000)),/future/)})
test('SQLite survives reopen, deduplicates, excludes gaps and splits Nepal midnight',()=>{const dir=mkdtempSync(join(tmpdir(),'gml-db-test-')),file=join(dir,'history.sqlite'),sn=METERS[0].sn;let s=createStore(file);try{const t=Date.parse('2026-01-01T18:14:30Z');const a=parse(sn,sample(sn,t),{receivedAt:t});assert.equal(s.record(a),true);assert.equal(s.record(a),false);s.record(parse(sn,sample(sn,t+60000),{receivedAt:t+60000}));s.record(parse(sn,sample(sn,t+600000),{receivedAt:t+600000}));s.event(sn,'TEST','persisted',t);s.close();s=createStore(file);const x=s.analytics(sn,t,t+600000);assert.equal(x.daily.length,2);assert.ok(Math.abs(x.kwh-.1)<1e-9);assert.ok(Math.abs(x.daily[0].coveredHours-1/120)<1e-9);assert.equal(s.coverage(sn).count,3);assert.equal(s.events(t,t+600000)[0].detail,'persisted');assert.equal(s.query(sn,t,t+600000)[0].pfa,0)}finally{s.close();rmSync(dir,{recursive:true,force:true})}})
test('seven injected MQTT streams traverse validation, SQLite, HTTP and WebSocket; stale and recovery are explicit',async()=>{let time=Date.now();const client=new EventEmitter();client.subscribe=(topics,opts,cb)=>{assert.equal(topics.length,7);cb(null,topics.map(topic=>({topic,qos:0})))};client.end=()=>{};const b=createBridge({env:{MQTT_USERNAME:'fixture',MQTT_PASSWORD:'fixture',STALE_AFTER_S:'2'},store:createStore(':memory:'),now:()=>time,mqttConnect:()=>client});const a=await b.start(0);const ws=new WebSocket(`ws://127.0.0.1:${a.port}`);const messages=[];ws.on('message',d=>messages.push(JSON.parse(d)));try{await once(ws,'open');client.emit('connect');for(const m of METERS)client.emit('message',topicFor(m.sn),Buffer.from(sample(m.sn,time,true)),{});await new Promise(r=>setTimeout(r,30));assert.equal(messages.filter(m=>m.type==='reading').length,7);let status=await (await fetch(`http://127.0.0.1:${a.port}/api/status`)).json();assert.ok(status.meters.every(m=>m.status==='LIVE'));for(const m of METERS){const h=await (await fetch(`http://127.0.0.1:${a.port}/api/history/${m.id}`)).json();assert.equal(h.rows.length,1);assert.equal(h.rows[0].pfa,0)}time+=3000;b.refresh();assert.ok(b.snapshot().meters.every(m=>m.status==='STALE'));client.emit('message',topicFor(METERS[0].sn),Buffer.from(sample(METERS[0].sn,time)),{});assert.equal(b.snapshot().meters[0].status,'LIVE');assert.ok(b.store.events(0,time).some(e=>e.detail.includes('STALE')));const denied=await fetch(`http://127.0.0.1:${a.port}/api/status`,{headers:{Origin:'https://untrusted.example'}});assert.equal(denied.status,403)}finally{ws.terminate();await b.close()}})
test('missing configuration never connects or generates readings',async()=>{const b=createBridge({env:{},store:createStore(':memory:'),mqttConnect:()=>{throw Error('must not connect')}});await b.start(0);assert.equal(b.snapshot().broker,'NOT_CONFIGURED');assert.ok(b.snapshot().meters.every(m=>!m.latest));await b.close()})

test('MQTT errors retain observed cause without echoing sensitive error text',()=>{
 assert.match(mqttReason({code:5}),/denied access/)
 assert.match(mqttReason({code:'ENOTFOUND'}),/DNS/)
 assert.match(mqttReason({message:'connack timeout'}),/acknowledge/)
 assert.equal(mqttReason({message:'mqtt://private-user:private-secret@host'}),'MQTT connection failed; the client did not identify the cause')
})
test('missing or rejected topic acknowledgements cannot claim a live broker feed',async()=>{
 const client=new EventEmitter();client.end=()=>{};let grants=[]
 client.subscribe=(_topics,_options,cb)=>cb(null,grants)
 const b=createBridge({env:{MQTT_USERNAME:'fixture',MQTT_PASSWORD:'fixture'},store:createStore(':memory:'),mqttConnect:()=>client})
 await b.start(0)
 try{client.emit('connect');assert.equal(b.snapshot().broker,'SUBSCRIPTION_FAILED');grants=METERS.map(m=>({topic:topicFor(m.sn),qos:0}));grants[0].qos=128;client.emit('connect');assert.equal(b.snapshot().broker,'SUBSCRIPTION_FAILED');grants[0].qos=0;client.emit('connect');assert.equal(b.snapshot().broker,'LIVE');client.emit('error',{code:5});client.emit('close');assert.match(b.snapshot().reason,/denied access/)}finally{await b.close()}
})

test('real MQTT client resubscribes all seven topics and waits for acknowledgements after reconnect',async()=>{
 const sockets=new Set(),subscriptions=[]
 const broker=createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{})
  const parser=mqttPacket.parser();socket.on('data',data=>parser.parse(data))
  parser.on('packet',packet=>{
   if(packet.cmd==='connect')socket.write(mqttPacket.generate({cmd:'connack',sessionPresent:false,returnCode:0}))
   if(packet.cmd==='subscribe')subscriptions.push({socket,packet,ack:()=>socket.write(mqttPacket.generate({cmd:'suback',messageId:packet.messageId,granted:packet.subscriptions.map(()=>0)}))})
   if(packet.cmd==='pingreq')socket.write(mqttPacket.generate({cmd:'pingresp'}))
  })
 })
 await new Promise(r=>broker.listen(0,'127.0.0.1',r))
 const waitFor=async predicate=>{const deadline=Date.now()+3000;while(!predicate()){if(Date.now()>deadline)throw Error('Timed out awaiting local MQTT fixture');await new Promise(r=>setTimeout(r,10))}}
 const b=createBridge({env:{MQTT_USERNAME:'fixture',MQTT_PASSWORD:'fixture'},store:createStore(':memory:'),mqttConnect:(_url,options)=>mqtt.connect(`mqtt://127.0.0.1:${broker.address().port}`,{...options,reconnectPeriod:20})})
 try{
  await b.start(0);await waitFor(()=>subscriptions.length===1)
  assert.equal(subscriptions[0].packet.subscriptions.length,7);assert.equal(b.snapshot().broker,'CONNECTING')
  subscriptions[0].ack();await waitFor(()=>b.snapshot().broker==='LIVE')
  subscriptions[0].socket.destroy();await waitFor(()=>subscriptions.length===2)
  assert.equal(subscriptions[1].packet.subscriptions.length,7);assert.equal(b.snapshot().broker,'CONNECTING')
  subscriptions[1].ack();await waitFor(()=>b.snapshot().broker==='LIVE')
  assert.equal(b.snapshot().reason,'')
 }finally{await b.close();for(const socket of sockets)socket.destroy();await new Promise(r=>broker.close(r))}
})

test('an acknowledgement from a closed connection cannot restore LIVE',async()=>{
 const client=new EventEmitter(),callbacks=[];client.end=()=>{}
 client.subscribe=(topics,_options,cb)=>callbacks.push(()=>cb(null,topics.map(topic=>({topic,qos:0}))))
 const b=createBridge({env:{MQTT_USERNAME:'fixture',MQTT_PASSWORD:'fixture'},store:createStore(':memory:'),mqttConnect:()=>client})
 await b.start(0)
 try{client.emit('connect');assert.equal(b.snapshot().broker,'CONNECTING');client.emit('close');callbacks[0]();assert.equal(b.snapshot().broker,'DISCONNECTED');client.emit('connect');callbacks[1]();assert.equal(b.snapshot().broker,'LIVE')}finally{await b.close()}
})
