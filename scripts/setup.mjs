import {existsSync,copyFileSync,constants} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const root=fileURLToPath(new URL('../',import.meta.url))
const [major,minor]=process.versions.node.split('.').map(Number)
if(major<22||(major===22&&minor<13)){
 console.error('Install Node.js 22.13+ or a supported Node 24 LTS release first.');process.exit(1)
}
if(!process.argv.includes('--config-only')){
 const npm=process.env.npm_execpath
 if(!npm||!existsSync(npm)){console.error('Run this installer with npm run setup.');process.exit(1)}
 for(const cwd of [root,path.join(root,'server')]){
  console.log(`Installing locked dependencies for ${cwd===root?'frontend/build tools':'local telemetry service'}...`)
  const result=spawnSync(process.execPath,[npm,'ci'],{cwd,stdio:'inherit',env:process.env})
  if(result.error||result.status!==0){console.error('Dependency installation failed; resolve the npm error above before starting.');process.exit(result.status||1)}
 }
}
for(const [source,target] of [['server/.env.example','server/.env'],['server/meters.example.json','server/meters.json']]){
 try{copyFileSync(path.join(root,source),path.join(root,target),constants.COPYFILE_EXCL);console.log(`Created ${target} from its template.`)}
 catch(e){if(e.code==='EEXIST')console.log(`Preserved existing ${target}.`);else throw e}
}
console.log('Local setup ready. Edit MQTT credentials privately in server/.env. Replace any EXAMPLE meter serials in server/meters.json before testing live data.')
console.log('Start: npm run dev | Stop: npm stop. Python setup, when needed: python -m pip install -r requirements.txt')
