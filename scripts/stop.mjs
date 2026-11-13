import {fileURLToPath} from 'node:url'
import {stopRegistered} from './runtime-control.mjs'
import {dashboardAvailable,apiAvailable} from './launcher-health.mjs'
const root=fileURLToPath(new URL('../',import.meta.url))
const result=await stopRegistered(root)
if(result.stopped)console.log(`Stop requested for ${result.stopped} GML launcher(s).`)
await new Promise(r=>setTimeout(r,1200))
const dashboard=await dashboardAvailable(5173),api=await apiAvailable('http://127.0.0.1:8787')
if(dashboard||api){console.error('A GML service is still running outside this launcher. Stop it in its original terminal with Ctrl+C. No unrelated process was terminated.');process.exitCode=1}
else console.log('GML dashboard and local MQTT service are stopped. Stored history is preserved.')
if(result.unreachable)console.log('An old launcher record could not be reached. No process was killed based only on a PID.')
