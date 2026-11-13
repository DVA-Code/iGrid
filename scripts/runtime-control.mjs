import http from 'node:http'
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto'
import {mkdirSync,writeFileSync,readFileSync,readdirSync,unlinkSync,chmodSync} from 'node:fs'
import path from 'node:path'
const fingerprint=root=>createHash('sha256').update(path.resolve(root).toLowerCase()).digest('hex')
const safeEqual=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y)}
export async function createControl(root,onStop){
 const directory=path.join(root,'.runtime');mkdirSync(directory,{recursive:true,mode:0o700})
 const token=randomBytes(32).toString('hex'),instance=randomBytes(16).toString('hex'),workspace=fingerprint(root)
 let stopping=false,file
 const server=http.createServer((req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store')
  if(req.headers.origin||!safeEqual(req.headers.authorization,`Bearer ${token}`)){res.writeHead(403);res.end('{"error":"Denied"}');return}
  if(req.url==='/status'&&req.method==='GET'){res.end(JSON.stringify({instance,workspace}));return}
  if(req.url==='/stop'&&req.method==='POST'){
   res.end(JSON.stringify({instance,stopping:true}))
   if(!stopping){stopping=true;setImmediate(()=>onStop())}return
  }
  res.writeHead(404);res.end('{"error":"Not found"}')
 })
 server.requestTimeout=3000;server.headersTimeout=3000
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)})
 const port=server.address().port
 file=path.join(directory,`gml-${process.pid}-${instance}.json`)
 writeFileSync(file,JSON.stringify({version:1,workspace,instance,port,token}),{mode:0o600,flag:'wx'})
 try{chmodSync(file,0o600)}catch{}
 return {port,close:async()=>{try{unlinkSync(file)}catch{};server.closeAllConnections();await new Promise(r=>server.close(r))}}
}
export async function stopRegistered(root){
 const directory=path.join(root,'.runtime'),workspace=fingerprint(root);let files
 try{files=readdirSync(directory).filter(x=>/^gml-\d+-[a-f0-9]+\.json$/.test(x))}catch(e){if(e.code==='ENOENT')return {stopped:0,unreachable:0};throw e}
 let stopped=0,unreachable=0
 for(const name of files){
  const file=path.join(directory,name);let entry
  try{entry=JSON.parse(readFileSync(file,'utf8'))}catch{continue}
  if(entry.workspace!==workspace||!Number.isInteger(entry.port)||entry.port<1||entry.port>65535||!/^[a-f0-9]{64}$/.test(entry.token)||!/^[a-f0-9]{32}$/.test(entry.instance))continue
  const address=`http://127.0.0.1:${entry.port}`,headers={Authorization:`Bearer ${entry.token}`}
  try{
   const check=await fetch(address+'/status',{headers,signal:AbortSignal.timeout(2000)})
   if(!check.ok){unreachable++;continue}const known=await check.json()
   if(known.instance!==entry.instance||known.workspace!==workspace){unreachable++;continue}
   const response=await fetch(address+'/stop',{method:'POST',headers,signal:AbortSignal.timeout(2000)})
   if(response.ok&&(await response.json()).instance===entry.instance)stopped++;else unreachable++
  }catch{unreachable++}
 }
 return {stopped,unreachable}
}
