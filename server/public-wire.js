import {METERS,BY_SN} from './parse.js'
import {mqttReason} from './diagnostics.js'

// The MQTT identity belongs only to the collector and its private database.
// Browser identifiers stay stable when a physical meter is replaced.
const BY_ID=new Map(METERS.map(m=>[m.id,m]))
export function resolvePublicMeter(id){return BY_ID.get(typeof id==='string'?id.toLowerCase():'')||null}
const meterFor=value=>BY_SN.get(value)||BY_ID.get(value)
const identifier=value=>meterFor(value)?.id??null
const numeric=(source,keys)=>Object.fromEntries(keys.filter(k=>source?.[k]===null||Number.isFinite(source?.[k])).map(k=>[k,source[k]]))
const statuses=new Set(['LIVE','NO DATA','STALE','NOT_CONFIGURED','CONNECTING','DISCONNECTED','SUBSCRIPTION_FAILED','CONNECTION_ERROR','COLLECTOR_OFFLINE'])
const status=value=>statuses.has(value)?value:'DISCONNECTED'
const reasons=new Set(['','MQTT credentials missing','Waiting for MQTT broker acknowledgement','Waiting for seven MQTT topic acknowledgements','MQTT broker did not approve all seven meter topic subscriptions','MQTT connection closed; cause unverified',
 ...['4','5','134','135','ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ETIMEDOUT','ESOCKETTIMEDOUT','ECONNRESET','ENETUNREACH','EHOSTUNREACH','EACCES','EPERM','ERR_TLS_CERT_ALTNAME_INVALID','CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT',''].map(code=>mqttReason({code})),mqttReason({message:'connack timeout'})])
const reason=value=>reasons.has(value)?value:'Telemetry service reported an error; cause unavailable'
const parseErrors=new Set(['Unregistered meter','Retained message: measurement age cannot be verified','Payload exceeds 64 KiB','Invalid JSON','Payload SN does not match subscribed topic','Expected three phase arrays','Invalid or future device timestamp'])
export const publicRejection=value=>parseErrors.has(value)||typeof value==='string'&&/^Phase [ABC]: (seven finite numeric fields required|invalid measurement range)$/.test(value)?value:'Message rejected; validation or storage failed'
const measurementFields=['t','receivedAt','deviceTimestamp','va','vb','vc','ia','ib','ic','pfa','pfb','pfc','pKw','freq','energyInKwh','energyOutKwh','n','first','last']
const quality=value=>Array.isArray(value)?value.filter(v=>typeof v==='string'&&/^(RECEPTION_TIME_ONLY|AGGREGATED|PHASE_[ABC]_(LOW|HIGH)_VOLTAGE)$/.test(v)):[]
export function publicReading(r){
 if(!r)return null
 const m=meterFor(r.sn);if(!m)return null
 return{...numeric(r,measurementFields),sn:m.id,id:m.id,name:m.name,origin:'MEASURED',
  timeBasis:['received','device','aggregate'].includes(r.timeBasis)?r.timeBasis:'received',quality:quality(r.quality),
  ...(Array.isArray(r.datas)&&r.datas.length===3&&r.datas.every(p=>Array.isArray(p)&&p.length===7&&p.every(Number.isFinite))?{datas:r.datas}:{}),
 }
}
export function publicSnapshot(s){return{
 type:'snapshot',broker:status(s.broker),reason:reason(s.reason),...numeric(s,['now','staleAfterMs']),
 meters:s.meters.filter(m=>meterFor(m.sn)).map(m=>({sn:identifier(m.sn),id:identifier(m.sn),name:meterFor(m.sn).name,model:meterFor(m.sn).model,role:meterFor(m.sn).role,
  latest:publicReading(m.latest),...numeric(m,['count','intervalSeconds']),lastError:m.lastError?publicRejection(m.lastError):null,quality:quality(m.quality),status:status(m.status)})),
}}
export function publicEvent(e){
 const kind=['CONNECTION','REJECTED','COUNTER_RESET','VOLTAGE'].includes(e.kind)?e.kind:'EVENT'
 let detail='Recorded telemetry event'
 if(kind==='CONNECTION'){const found=String(e.detail).match(/\b(?:LIVE|NO DATA|STALE|NOT_CONFIGURED|CONNECTING|DISCONNECTED|SUBSCRIPTION_FAILED|CONNECTION_ERROR|COLLECTOR_OFFLINE)\b/g)||[];detail=found.length===2?`${found[0]} → ${found[1]}`:'Telemetry connection state changed'}
 if(kind==='REJECTED')detail=publicRejection(e.detail)
 if(kind==='COUNTER_RESET')detail='Energy counter decreased; negative counter delta excluded'
 if(kind==='VOLTAGE'){const flags=quality(String(e.detail).split(','));detail=flags.length?flags.join(','):'Voltage warning changed; not an equipment fault diagnosis'}
 return{...numeric(e,['id','t']),sn:identifier(e.sn),kind,detail}
}
export function publicCoverage(c){return numeric(c,['first','last','count','days'])}
export function publicForecast(f,id){return{sn:id,...numeric(f,['generatedAt','coverageHours','savedForecasts']),
 points:(f.points||[]).map(p=>numeric(p,['t','p'])),basis:f.points?.length?'Experimental local-hour profile, adjusted to latest demand. Compare with later measurements.':'Insufficient fresh history: collect at least 24 hours with observations in every local hour.',model:'local-hour-profile-v1'}}
export function publicMessage(message){
 if(message.type==='snapshot')return publicSnapshot(message)
 if(message.type==='reading')return{type:'reading',data:publicReading(message.data)}
 if(message.type==='event')return{type:'event',data:publicEvent(message.data)}
 if(message.type==='history')return{type:'history',data:Object.fromEntries(Object.entries(message.data).filter(([sn])=>identifier(sn)).map(([sn,rows])=>[identifier(sn),rows.map(publicReading).filter(Boolean)]))}
 throw new Error('Unsupported browser message')
}
