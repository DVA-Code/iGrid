import {createServer} from 'node:net'

export async function apiAvailable(target){
 try{const res=await fetch(`${target}/api/status`,{signal:AbortSignal.timeout(1500)});if(!res.ok)return false;const s=await res.json();return s.type==='snapshot'&&Array.isArray(s.meters)&&typeof s.broker==='string'}catch{return false}
}
export async function dashboardAvailable(port){
 try{
  const res=await fetch(`http://127.0.0.1:${port}/`,{signal:AbortSignal.timeout(1500)})
  if(!res.ok||!res.headers.get('content-type')?.includes('text/html'))return false
  const page=await res.text()
  return page.includes('<title>GRID Modernization Laboratory research</title>')&&page.includes('id="root"')
 }catch{return false}
}
export function portAvailable(port){
 return new Promise(resolve=>{const probe=createServer();probe.once('error',()=>resolve(false));probe.listen(port,'127.0.0.1',()=>probe.close(()=>resolve(true)))})
}
export async function chooseDashboardPort(preferred){
 for(let port=preferred;port<preferred+10;port++){
  if(await portAvailable(port))return {port,reuse:false}
  if(await dashboardAvailable(port))return {port,reuse:true}
 }
 throw new Error(`No dashboard port is available between ${preferred} and ${preferred+9}. Existing services were left running.`)
}
