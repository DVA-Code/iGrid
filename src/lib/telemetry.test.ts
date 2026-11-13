import {describe,expect,it,vi} from 'vitest'
import {apiConfigurationReason,requestSnapshot,statusFailure,telemetryEndpoints,validateSnapshot} from './telemetry'

describe('telemetry transport selection',()=>{
 it('uses the Python server on its own port instead of forcing the Node bridge',()=>{
  expect(telemetryEndpoints('http://localhost:8788/#/map','./')).toEqual({api:'http://localhost:8788',ws:''})
 })
 it('keeps LAN and mounted cPanel pages on their own API origin',()=>{
  expect(telemetryEndpoints('http://192.168.1.8:5173/#/energy','./').api).toBe('http://192.168.1.8:5173')
  expect(telemetryEndpoints('https://gml.example/research/#/map','./')).toEqual({api:'https://gml.example/research',ws:''})
 })
 it('preserves explicitly configured API and WebSocket endpoints',()=>{
  expect(telemetryEndpoints('https://gml.example/','./','https://api.example/gml/','wss://live.example/')).toEqual({api:'https://api.example/gml',ws:'wss://live.example/'})
 })
 it('identifies mixed content from the actual configured URL',()=>{
  expect(apiConfigurationReason('https://gml.example/','http://api.example')).toContain('insecure HTTP API')
  expect(apiConfigurationReason('https://gml.example/','https://gml.example')).toBe('')
 })
})
const snapshot={type:'snapshot',broker:'LIVE',now:Date.now(),meters:[]}
describe('evidence-based fetch diagnoses',()=>{
 it('does not treat an HTML fallback page as a working telemetry service',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response('<html>app</html>',{headers:{'Content-Type':'text/html'}}))
  await expect(requestSnapshot('http://lab',{fetcher})).rejects.toThrow('instead of JSON')
 })
 it('reports observed access denial and unavailable backend status',async()=>{
  for(const status of [401,403,404,502,503,504]){
   const fetcher=vi.fn().mockResolvedValue(new Response('',{status}))
   await expect(requestSnapshot('http://lab',{fetcher})).rejects.toThrow(`HTTP ${status}`)
  }
  expect(statusFailure(403)).toContain('denied this request')
 })
 it('rejects malformed snapshots before any connection is declared live',()=>{
  for(const value of [{type:'snapshot'},{...snapshot,meters:null},{...snapshot,now:'today'},{...snapshot,meters:[{}]}])expect(()=>validateSnapshot(value)).toThrow('invalid status response')
  expect(validateSnapshot(snapshot)).toEqual(snapshot)
 })
 it('does not call a generic browser network error a permissions or power failure',async()=>{
  const fetcher=vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
  await expect(requestSnapshot('http://lab',{fetcher})).rejects.toThrow('browser did not expose the exact cause')
 })
 it('has a request deadline rather than leaving a frozen LIVE state',async()=>{
  const fetcher:typeof fetch=(_url,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new Error('Aborted'))))
  await expect(requestSnapshot('http://lab',{fetcher,timeoutMs:5})).rejects.toThrow('did not respond')
 })
 it('accepts a valid JSON snapshot',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify(snapshot),{headers:{'Content-Type':'application/json'}}))
  expect(await requestSnapshot('http://lab',{fetcher})).toEqual(snapshot)
 })
})
