import {useEffect,useState} from 'react'
import {BRIDGE_HTTP,useStore} from './store'
export function useForecast(sn:string){
 const bridge=useStore(s=>s.bridge),[result,setResult]=useState<{points:{t:number;p:number}[];basis:string;savedForecasts:number}|null>(null)
 useEffect(()=>{let alive=true;setResult(null);if(bridge!=='open')return;const load=()=>fetch(`${BRIDGE_HTTP}/api/forecast/${sn}`).then(r=>{if(!r.ok)throw Error();return r.json()}).then(j=>{if(alive)setResult(j)}).catch(()=>{});void load();const timer=setInterval(load,60000);return()=>{alive=false;clearInterval(timer)}},[sn,bridge])
 return result
}
