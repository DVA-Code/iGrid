import {create} from 'zustand'
import {demoReading} from './data/demo'
import type {MeterReading} from './models/energy'
import {telemetryEndpoints,apiConfigurationReason,requestSnapshot,validateSnapshot} from './telemetry'
export type SourceTag='LIVE'|'CONNECTING'|'STALE'|'DISCONNECTED'|'REPLAY'|'DEMO'|'REPORTED'|'CALCULATED'|'SIMULATED'|'NOT AVAILABLE'
export type Phase='a'|'b'|'c'
export const METERS=[
 {sn:'main-transformer',id:'main-transformer',name:'Main Transformer',short:'Main Transformer',scale:1},
 {sn:'block-7',id:'block-7',name:'Bio-Tech Department (Block 7)',short:'Block 7 · Bio-Tech',scale:.09},
 {sn:'block-6',id:'block-6',name:'Block 6 (Department of Physics)',short:'Block 6 · Physics',scale:.03},
 {sn:'block-11',id:'block-11',name:'Block 11 (Department of Civil Engineering)',short:'Block 11 · Civil',scale:.04},
 {sn:'block-10',id:'block-10',name:'Block 10 (Department of Management Information)',short:'Block 10 · Management',scale:.12},
 {sn:'block-8',id:'block-8',name:'Block 8 (Department of Electrical and Electronics)',short:'Block 8 · Electrical',scale:.1},
 {sn:'boys-hostel',id:'boys-hostel',name:'Boys Hostel',short:'Boys Hostel',scale:.08},
] as const
export const MAIN_SN='main-transformer'
export type LiveReading=MeterReading&{sn?:string;receivedAt?:number;energyInKwh?:number;energyOutKwh?:number;quality?:string[];datas?:number[][];origin?:'MEASURED'|'DEMO';timeBasis?:string}
export type MeterLive={latest:LiveReading|null;history:LiveReading[];receivedAt:number;intervalSeconds?:number|null;status?:string;lastError?:string|null}
export type StoredEvent={id:number;sn:string|null;t:number;kind:string;detail:string}
const EMPTY:LiveReading={t:0,va:NaN,vb:NaN,vc:NaN,ia:NaN,ib:NaN,ic:NaN,pfa:NaN,pfb:NaN,pfc:NaN,pKw:NaN}
interface Store{
 adapter:'demo'|'mqtt';bridge:'off'|'connecting'|'open';bridgeReason:string;broker:string;brokerReason:string;meters:Record<string,MeterLive>;events:StoredEvent[];staleAfterMs:number;
 energyMeter:string;setEnergyMeter:(sn:string)=>void;setSource:(source:'demo'|'mqtt')=>void;
 paused:boolean;latest:MeterReading;receivedAt:number;history:MeterReading[];now:number;
 theme:'dark'|'light';reducedMotion:boolean;selectedPhase:Phase|null;setTheme:(t:'dark'|'light')=>void;toggleMotion:()=>void;selectPhase:(p:Phase|null)=>void;tick:()=>void;setPaused:(v:boolean)=>void
}
const n=Date.now()
export const useStore=create<Store>((set,get)=>({
 adapter:'mqtt',bridge:'off',bridgeReason:'Telemetry service has not been contacted yet',broker:'NOT_CONFIGURED',brokerReason:'',meters:{},events:[],staleAfterMs:120000,energyMeter:MAIN_SN,
 setEnergyMeter:sn=>{if(METERS.some(m=>m.sn===sn))set({energyMeter:sn})},
 setSource:adapter=>{const m=get().meters[MAIN_SN];set({adapter,paused:false,latest:adapter==='demo'?demoReading(Date.now()):m?.latest??EMPTY,receivedAt:adapter==='demo'?Date.now():m?.receivedAt??0,history:adapter==='demo'?Array.from({length:121},(_,i)=>demoReading(Date.now()-(120-i)*60000)):m?.history??[]})},
 paused:false,latest:EMPTY,receivedAt:0,history:[],now:n,theme:document.documentElement.dataset.theme==='dark'?'dark':'light',
 reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches,selectedPhase:null,
 tick:()=>{const st=get(),now=Date.now();if(st.adapter==='mqtt'||st.paused){set({now});return}const r=demoReading(now);set({now,latest:r,receivedAt:now,history:[...st.history,r].filter(x=>x.t>now-2*3600000).slice(-1440)})},
 setPaused:paused=>set({paused}),setTheme:theme=>{try{localStorage.setItem('gml-theme',theme)}catch{}document.documentElement.dataset.theme=theme;set({theme})},
 toggleMotion:()=>{const reducedMotion=!get().reducedMotion;document.documentElement.dataset.motion=reducedMotion?'reduced':'full';set({reducedMotion})},
 selectPhase:selectedPhase=>set({selectedPhase}),
}))
export function meterStatus(s:Store,sn:string):SourceTag{
 if(s.adapter==='demo')return'DEMO'
 if(s.bridge!=='open')return s.bridge==='connecting'?'CONNECTING':'DISCONNECTED'
 if(s.broker==='NOT_CONFIGURED')return'NOT AVAILABLE'
 if(s.broker!=='LIVE')return s.broker==='CONNECTING'?'CONNECTING':'DISCONNECTED'
 const r=s.meters[sn]?.latest;if(!r)return'NOT AVAILABLE'
 const age=s.now-Math.min(r.t,r.receivedAt??r.t)
 return age>Math.max(s.staleAfterMs,(s.meters[sn]?.intervalSeconds??0)*3000)||age< -60000?'STALE':'LIVE'
}
export function feedStatus(s:Store):SourceTag{return meterStatus(s,MAIN_SN)}
export function meterReading(s:Store,sn:string):{latest:LiveReading;history:LiveReading[];receivedAt:number}{
 if(s.adapter==='mqtt'){const m=s.meters[sn];return{latest:m?.latest??EMPTY,history:m?.history??[],receivedAt:m?.receivedAt??0}}
 const k=METERS.find(m=>m.sn===sn)?.scale??1
 const scale=(r:MeterReading):LiveReading=>({...r,ia:r.ia*k,ib:r.ib*k,ic:r.ic*k,pKw:undefined,origin:'DEMO',sn})
 return{latest:scale(s.latest),history:s.history.map(scale),receivedAt:s.receivedAt}
}
const endpoints=telemetryEndpoints(location.href,import.meta.env.BASE_URL,import.meta.env.VITE_API_BASE||'',import.meta.env.VITE_LIVE_WS||'')
export const LIVE_WS=endpoints.ws
export const BRIDGE_HTTP=endpoints.api
export function connectionReason(s:Store,sn:string){
 if(s.adapter==='demo')return'Demo dataset selected'
 if(s.bridge!=='open')return s.bridgeReason||(s.bridge==='connecting'?'Checking telemetry service':'Unable to fetch telemetry from the lab API; exact cause unverified')
 if(s.broker!=='LIVE')return s.brokerReason||({NOT_CONFIGURED:'MQTT credentials missing',CONNECTING:'Connecting to MQTT broker',DISCONNECTED:'MQTT broker connection closed',SUBSCRIPTION_FAILED:'Broker rejected a topic subscription',COLLECTOR_OFFLINE:'MQTT collector heartbeat expired'} as Record<string,string>)[s.broker]||'MQTT connection unavailable; cause unverified'
 const m=s.meters[sn];if(m?.lastError)return m.lastError.startsWith('API ')?m.lastError:`Last message rejected: ${m.lastError}`
 if(!m?.latest)return'MQTT connected, but no valid reading received for this building. Meter publishing, meter power and its network connection are unverified.'
 if(meterStatus(s,sn)==='STALE')return`No fresh message for ${Math.max(0,Math.floor((s.now-Math.min(m.latest.t,m.latest.receivedAt??m.latest.t))/1000))} s. MQTT is connected; meter power, publishing and network cause are unverified.`
 return'Receiving validated MQTT readings'
}
export function toReading(d:unknown):LiveReading|null{
 if(!d||typeof d!=='object')return null
 const r=d as LiveReading
 if(!METERS.some(m=>m.sn===r.sn)||!['t','va','vb','vc','ia','ib','ic','pfa','pfb','pfc','pKw'].every(k=>typeof (r as unknown as Record<string,unknown>)[k]==='number'&&Number.isFinite((r as unknown as Record<string,number>)[k])))return null
 if(r.t<=0||r.t>Date.now()+60000||[r.va,r.vb,r.vc,r.ia,r.ib,r.ic].some(x=>x<0)||[r.pfa,r.pfb,r.pfc].some(x=>Math.abs(x)>1))return null
 if(r.receivedAt!==undefined&&(typeof r.receivedAt!=='number'||!Number.isFinite(r.receivedAt)||r.receivedAt<=0||r.receivedAt>Date.now()+60000))return null
 if(r.origin!=='MEASURED')return null
 return r
}
function ingest(r:LiveReading,historyOnly=false){
 const sn=r.sn!,st=useStore.getState(),old=st.meters[sn]??{latest:null,history:[],receivedAt:0}
 if(old.latest?.t===r.t&&!historyOnly)return
 const rows=[...old.history,r].sort((a,b)=>a.t-b.t).filter((x,i,a)=>!i||x.t!==a[i-1].t).filter(x=>x.t>Date.now()-6*3600000).slice(-4000)
 const latest=!historyOnly&&(!old.latest||r.t>old.latest.t)?r:old.latest
 const next={...old,latest,history:rows,receivedAt:latest?.receivedAt??latest?.t??0,lastError:latest!==old.latest?null:old.lastError}
 const update:Partial<Store>={meters:{...st.meters,[sn]:next}}
 if(sn===MAIN_SN&&st.adapter==='mqtt'){update.latest=latest??EMPTY;update.receivedAt=next.receivedAt;update.history=rows}
 useStore.setState(update)
}
let dispose:(()=>void)|undefined
export function startFeed(){
 dispose?.()
 let stopped=false,ws:WebSocket|undefined,retry:ReturnType<typeof setTimeout>|undefined,polling=false,lastWsSnapshot=0,lastVerifiedAt=0,lastServerStamp=0,stampAdvancedAt=0
 const controller=new AbortController(),historyLoaded=new Set<string>()
 const fail=(reason:string)=>{if(!stopped)useStore.setState({bridge:'off',bridgeReason:reason})}
 const loadHistory=(sn:string)=>{
  if(historyLoaded.has(sn))return;historyLoaded.add(sn)
  const request=new AbortController(),abort=()=>request.abort(),timeout=setTimeout(abort,7000)
  controller.signal.addEventListener('abort',abort,{once:true})
  void fetch(`${BRIDGE_HTTP}/api/history/${sn}?range=6h`,{signal:request.signal,cache:'no-store',credentials:'same-origin'}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(value=>{if(stopped||!Array.isArray(value.rows))return;for(const d of value.rows){const r=toReading(d);if(r&&r.sn===sn)ingest(r,true)}}).catch(()=>{historyLoaded.delete(sn)}).finally(()=>{clearTimeout(timeout);controller.signal.removeEventListener('abort',abort)})
 }
 const handle=(m:Record<string,any>)=>{
  if(stopped)return false
  if(m.type==='reading'){const r=toReading(m.data);if(r)ingest(r)}
  if(m.type==='event'&&m.data&&typeof m.data==='object')useStore.setState(s=>({events:[m.data,...s.events].slice(0,200)}))
  if(m.type==='history'&&m.data&&typeof m.data==='object')Object.values(m.data as Record<string,unknown[]>).forEach(rows=>{if(Array.isArray(rows))rows.forEach(d=>{const r=toReading(d);if(r)ingest(r,true)})})
  if(m.type!=='snapshot')return false
  const snap=validateSnapshot(m),now=Date.now()
  if(snap.now!==lastServerStamp){lastServerStamp=snap.now;stampAdvancedAt=now}
  if(now-stampAdvancedAt>15000)throw Error('Telemetry service is returning an unchanged status timestamp; current MQTT connection cannot be verified.')
  lastVerifiedAt=now
  useStore.setState({bridge:'open',bridgeReason:'',broker:snap.broker,brokerReason:typeof snap.reason==='string'?snap.reason:'',staleAfterMs:Math.max(1000,Number(snap.staleAfterMs)||120000)})
  for(const known of METERS){
   const meter=snap.meters.find(x=>x.sn===known.sn)
   const candidate=toReading(meter?.latest),r=candidate?.sn===known.sn?candidate:null
   if(r)ingest(r)
   const invalid=meter?.latest!=null&&!r
   useStore.setState(s=>({meters:{...s.meters,[known.sn]:{...(s.meters[known.sn]??{latest:null,history:[],receivedAt:0}),...(!r?{latest:null,receivedAt:0}:{}),status:typeof meter?.status==='string'?meter.status:undefined,intervalSeconds:typeof meter?.intervalSeconds==='number'&&Number.isFinite(meter.intervalSeconds)&&meter.intervalSeconds>0?meter.intervalSeconds:null,lastError:!meter?'API did not return a status for this building':invalid?'API supplied an invalid meter reading':typeof meter.lastError==='string'?meter.lastError:null}}}))
   if(r)loadHistory(known.sn)
  }
  return true
 }
 const poll=async()=>{
  if(stopped||polling||Date.now()-lastWsSnapshot<8000)return
  if(typeof navigator!=='undefined'&&navigator.onLine===false){fail('Browser reports no network connection. Live telemetry cannot be fetched.');return}
  const configReason=apiConfigurationReason(location.href,BRIDGE_HTTP);if(configReason){fail(configReason);return}
  polling=true
  try{handle(await requestSnapshot(BRIDGE_HTTP,{signal:controller.signal}))}
  catch(e){if(!stopped&&Date.now()-lastWsSnapshot>=8000)fail(e instanceof Error?e.message:'Unable to fetch telemetry; exact cause unverified')}
  finally{polling=false}
 }
 const connect=()=>{
  if(stopped||!LIVE_WS||location.protocol==='https:'&&LIVE_WS.startsWith('ws:'))return
  try{ws=new WebSocket(LIVE_WS)}catch{retry=setTimeout(connect,5000);return}
  ws.onmessage=e=>{try{if(handle(JSON.parse(e.data)))lastWsSnapshot=Date.now()}catch(e){fail(e instanceof Error?e.message:'Invalid telemetry response')}}
  ws.onerror=()=>{if(!lastVerifiedAt)fail('WebSocket connection could not be established; checking the telemetry HTTP API.')}
  ws.onclose=()=>{if(stopped)return;lastWsSnapshot=0;if(Date.now()-lastVerifiedAt>8000)fail('Telemetry WebSocket disconnected; checking the HTTP API.');void poll();retry=setTimeout(connect,5000)}
 }
 useStore.setState({bridge:'connecting',bridgeReason:'Checking the lab telemetry API'})
 connect();void poll()
 const polls=setInterval(poll,3000),timer=setInterval(()=>{useStore.getState().tick();if(lastVerifiedAt&&Date.now()-lastVerifiedAt>15000&&useStore.getState().bridge==='open')fail('No verified status response from the telemetry service for 15 seconds. Live connection cannot be confirmed.')},1000)
 const visibility=()=>{if(!document.hidden){useStore.getState().tick();void poll()}},online=()=>void poll(),offline=()=>fail('Browser reports no network connection. Live telemetry cannot be fetched.')
 document.addEventListener('visibilitychange',visibility);window.addEventListener('online',online);window.addEventListener('offline',offline)
 dispose=()=>{stopped=true;controller.abort();clearInterval(polls);clearInterval(timer);clearTimeout(retry);if(ws){ws.onclose=null;ws.onmessage=null;ws.onerror=null;ws.close()}document.removeEventListener('visibilitychange',visibility);window.removeEventListener('online',online);window.removeEventListener('offline',offline)}
 return dispose
}
export const STALE_THRESHOLD_S=120
export const FEED_INTERVAL_S=1
