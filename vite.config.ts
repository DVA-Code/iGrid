import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import path from 'node:path'

const apiProxy:ProxyOptions={
 target:process.env.GML_BRIDGE_TARGET||'http://127.0.0.1:8787',changeOrigin:true,
 configure(proxy){
  proxy.on('proxyReq',(upstream,req)=>{
   // A same-origin request through this local frontend is not cross-origin at the API.
   if(req.headers.origin===`http://${req.headers.host}`||req.headers.origin===`https://${req.headers.host}`)upstream.removeHeader('origin')
  })
  proxy.on('error',(_error,_req,res)=>{
   if('writeHead' in res&&!res.headersSent){res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({code:'BACKEND_UNREACHABLE',error:'GML telemetry backend could not be reached'}))}
  })
 }
}

export default defineConfig(({ mode }) => ({
  base:'./',
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { proxy: { '/api': apiProxy },fs:{strict:true,allow:[path.resolve(__dirname)],deny:['.env','.env.*','*.{crt,pem,key}','**/.git/**','**/.runtime/**','**/server/**','**/python_backend/**','**/deploy/**','**/*.sqlite*','**/*.log']} },
  preview: { proxy: { '/api': apiProxy } },
  build: { outDir: mode === 'single' ? 'dist-single' : 'dist', chunkSizeWarningLimit: 4000 },
  test: { environment: 'node',include:['src/**/*.test.{ts,tsx}'] },
}))
