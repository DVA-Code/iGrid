import {spawn} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {apiAvailable,dashboardAvailable,chooseDashboardPort} from './launcher-health.mjs'
import {createControl} from './runtime-control.mjs'
import path from 'node:path'
const root=fileURLToPath(new URL('../',import.meta.url))
const require=createRequire(new URL('../server/package.json',import.meta.url))
let local={}
try{local=require('dotenv').parse(readFileSync(new URL('../server/.env',import.meta.url)))}catch(e){if(e.code!=='ENOENT')throw e}
const port=Number(process.env.PORT||local.PORT||8787),host=process.env.HOST||local.HOST||'127.0.0.1'
const address=host==='0.0.0.0'?'127.0.0.1':host==='::'?'[::1]':host
const target=`http://${address}:${port}`,preview=process.argv.includes('--preview')
const children=[];let stopping=false,control
function stop(){if(stopping)return;stopping=true;children.forEach(c=>c.kill('SIGTERM'));void control?.close()}
function launch(args,env=process.env){const c=spawn(process.execPath,[path.resolve(root,args[0]),...args.slice(1)],{cwd:root,stdio:'inherit',env});children.push(c);c.on('error',e=>{console.error(e.message);stop();process.exitCode=1});c.on('exit',code=>{if(!stopping){console.error('A service launched by this command stopped. Existing GML services were left running.');stop();process.exitCode=code??1}});return c}
async function waitReady(check){for(let i=0;i<30&&!stopping;i++){if(await check())return true;await new Promise(r=>setTimeout(r,200))}return false}
process.on('SIGINT',stop);process.on('SIGTERM',stop)
try{
 const web=await chooseDashboardPort(preview?4173:5173)
 control=await createControl(root,stop)
 if(await apiAvailable(target))console.log('Using the running GML telemetry service.')
 else{
  launch(['server/index.js'])
  if(!await waitReady(()=>apiAvailable(target)))throw Error('GML API did not start. See the service error above.')
 }
 if(!stopping){
  if(web.reuse)console.log(`GML dashboard is already running: http://localhost:${web.port}`)
  else{
   if(web.port!==(preview?4173:5173))console.log(`The usual dashboard port is occupied by another service. Using port ${web.port}.`)
   launch(['node_modules/vite/bin/vite.js',...(preview?['preview']:[]),'--host','127.0.0.1','--port',String(web.port),'--strictPort'],{...process.env,GML_BRIDGE_TARGET:target})
   if(!await waitReady(()=>dashboardAvailable(web.port)))throw Error('The GML dashboard did not become available. See the service error above.')
   console.log(`GML dashboard: http://localhost:${web.port}`)
  }
  if(!await waitReady(()=>apiAvailable(`http://127.0.0.1:${web.port}`)))console.error(`Dashboard API is unavailable through port ${web.port}. Backend target: ${target}. Run npm.cmd stop, then npm.cmd run dev to refresh the local proxy.`)
  if(children.length)console.log('Keep this terminal open. To stop from any terminal in this folder: npm.cmd stop')
  else{await control.close();control=undefined;console.log('No duplicate services started. To stop the existing system: npm.cmd stop')}
 }
}catch(e){console.error(e.message);stop();process.exitCode=1}
