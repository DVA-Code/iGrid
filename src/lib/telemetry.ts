export type TelemetrySnapshot={type:'snapshot';broker:string;reason?:string;now:number;staleAfterMs?:number;meters:Array<Record<string,unknown>&{sn:string}>}

/** Browser access is to the lab API. It never connects directly to IAMMETER. */
export function telemetryEndpoints(pageHref:string,baseUrl:string,apiBase='',liveWs=''){
 const page=new URL(pageHref),ws=liveWs.trim()?new URL(liveWs.trim(),page).href:''
 const api=apiBase.trim()?new URL(apiBase.trim(),page).href:ws?ws.replace(/^ws(s?):/,'http$1:'):new URL(baseUrl,page).href
 return {api:api.replace(/\/$/,''),ws}
}
export function apiConfigurationReason(pageHref:string,api:string){
 const page=new URL(pageHref),endpoint=new URL(api)
 if(!['http:','https:'].includes(page.protocol))return'Cannot fetch telemetry from a local file. Open the dashboard through the GML web service.'
 if(page.protocol==='https:'&&endpoint.protocol==='http:')return'Cannot fetch telemetry: this HTTPS page is configured to use an insecure HTTP API. Configure an HTTPS or same-origin API.'
 if(!['http:','https:'].includes(endpoint.protocol))return'Cannot fetch telemetry: the configured API URL must use HTTP or HTTPS.'
 return''
}
export function statusFailure(status:number){
 if(status===401)return'Telemetry API denied access (HTTP 401). Sign in to the lab service.'
 if(status===403)return'Telemetry API denied this request (HTTP 403). Access or origin permission must be checked on the server.'
 if(status===404)return'Telemetry API was not found (HTTP 404). The dashboard API route or backend is not configured at this address.'
 if(status===502||status===503||status===504)return`Telemetry backend unavailable (HTTP ${status}). The web server could not provide the telemetry service.`
 return`Unable to fetch telemetry: the API returned HTTP ${status}.`
}
export class TelemetryFailure extends Error{}
export function validateSnapshot(value:unknown):TelemetrySnapshot{
 if(!value||typeof value!=='object')throw new TelemetryFailure('Telemetry API returned an invalid status response; live data cannot be verified.')
 const m=value as Record<string,unknown>
 if(m.type!=='snapshot'||typeof m.broker!=='string'||!m.broker||typeof m.now!=='number'||!Number.isFinite(m.now)||m.now<=0||!Array.isArray(m.meters)||m.meters.some(x=>!x||typeof x!=='object'||typeof x.sn!=='string'))throw new TelemetryFailure('Telemetry API returned an invalid status response; live data cannot be verified.')
 return m as TelemetrySnapshot
}
export async function requestSnapshot(api:string,{signal,fetcher=fetch,timeoutMs=7000}:{signal?:AbortSignal;fetcher?:typeof fetch;timeoutMs?:number}={}):Promise<TelemetrySnapshot>{
 const controller=new AbortController();let timedOut=false
 const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()
 const timeout=setTimeout(()=>{timedOut=true;controller.abort()},timeoutMs)
 try{
  const response=await fetcher(`${api}/api/status`,{signal:controller.signal,cache:'no-store',credentials:'same-origin'})
  if(!response.ok)throw new TelemetryFailure(statusFailure(response.status))
  if(!response.headers.get('content-type')?.toLowerCase().includes('application/json'))throw new TelemetryFailure('Telemetry API returned a web page or unsupported response instead of JSON. Check the API route and backend.')
  let value:unknown
  try{value=await response.json()}catch{throw new TelemetryFailure('Telemetry API returned unreadable JSON; live data cannot be verified.')}
  return validateSnapshot(value)
 }catch(error){
  if(timedOut)throw new TelemetryFailure('Unable to fetch telemetry: the API did not respond within 7 seconds.')
  if(error instanceof TelemetryFailure)throw error
  throw new TelemetryFailure('Browser could not reach the telemetry API. The backend may be stopped or the request blocked; the browser did not expose the exact cause.')
 }finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort)}
}
