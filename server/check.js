import {createBridge} from './index.js'
import {createStore} from './store.js'
const seconds=Math.max(1,Math.min(300,Number(process.argv[2]||60))),b=createBridge({store:createStore(':memory:')})
await b.start(0)
if(b.snapshot().broker==='NOT_CONFIGURED'){
 console.log('NOT VERIFIED: MQTT_PASSWORD is missing. Enter the rotated password privately in server/.env.')
 console.table(b.snapshot().meters.map(m=>({meter:m.name,state:'NOT_CONFIGURED',messages:0})))
 await b.close();process.exitCode=2
}else{
 console.log(`Observing seven MQTT topics for ${seconds}s; credentials are never printed.`)
 await new Promise(r=>setTimeout(r,seconds*1000));const s=b.snapshot()
 console.log(`Broker: ${s.broker}${s.reason?' — '+s.reason:''}`)
 console.table(s.meters.map(m=>({meter:m.name,state:m.status,messages:m.count,interval_s:m.intervalSeconds?.toFixed(2)||'unmeasured',power_kW:m.latest?.pKw??'unavailable',last_error:m.lastError||''})))
 const all=s.meters.every(m=>m.status==='LIVE'&&m.count>1)
 console.log(all?'VERIFIED: all seven streams delivered multiple valid messages.':s.broker==='LIVE'?'PARTIAL DELIVERY: broker connected and topics approved, but not all meters delivered multiple fresh readings in this window. Power, publishing and meter network causes are unverified.':`NO VERIFIED FEED: ${s.reason||'MQTT connection unavailable; cause unverified'}`)
 await b.close();if(!all)process.exitCode=2
}
