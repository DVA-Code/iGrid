import {test} from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import {chooseDashboardPort,apiAvailable,dashboardAvailable} from './launcher-health.mjs'
const page='<title>GRID Modernization Laboratory research</title><div id="root"></div>'
async function fixture(body,contentType='text/html'){
 const server=http.createServer((_req,res)=>{res.setHeader('Content-Type',contentType);res.end(body)})
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 return {server,port:server.address().port,close:()=>new Promise(r=>{server.closeAllConnections();server.close(r)})}
}
test('a running GML dashboard is reused instead of spawning on its occupied port',async()=>{
 const f=await fixture(page)
 try{assert.deepEqual(await chooseDashboardPort(f.port),{port:f.port,reuse:true})}finally{await f.close()}
})
test('an unrelated service is preserved and a different local port is selected',async()=>{
 const f=await fixture('<title>Another service</title>')
 try{const found=await chooseDashboardPort(f.port);assert.ok(found.port>f.port);assert.equal(found.reuse,false);assert.equal((await fetch(`http://127.0.0.1:${f.port}`)).status,200)}finally{await f.close()}
})
test('an HTML app fallback cannot be mistaken for the telemetry API',async()=>{
 const f=await fixture(page)
 try{assert.equal(await dashboardAvailable(f.port),true);assert.equal(await apiAvailable(`http://127.0.0.1:${f.port}`),false)}finally{await f.close()}
})
