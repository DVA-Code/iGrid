import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,readdirSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {createControl,stopRegistered} from './runtime-control.mjs'
test('stop control refuses browser origins and unauthorized requests, then stops only the matching workspace',async()=>{
 const root=mkdtempSync(path.join(tmpdir(),'gml-control-')),other=mkdtempSync(path.join(tmpdir(),'gml-other-'));let called=0
 const control=await createControl(root,()=>{called++})
 try{
  const file=path.join(root,'.runtime',readdirSync(path.join(root,'.runtime'))[0]);const entry=JSON.parse(readFileSync(file,'utf8'))
  const url=`http://127.0.0.1:${control.port}/stop`
  assert.equal((await fetch(url,{method:'POST'})).status,403)
  assert.equal((await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${entry.token}`,Origin:'https://untrusted.example'}})).status,403)
  assert.equal(called,0);assert.equal((await stopRegistered(other)).stopped,0)
  assert.equal((await stopRegistered(root)).stopped,1)
  await new Promise(r=>setImmediate(r));assert.equal(called,1)
 }finally{await control.close();rmSync(root,{recursive:true,force:true});rmSync(other,{recursive:true,force:true})}
})
