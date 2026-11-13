import { readFileSync } from 'node:fs'
export const METERS = JSON.parse(readFileSync(new URL('./meters.json', import.meta.url)))
export const BY_SN = new Map(METERS.map(m => [m.sn.toUpperCase(), m]))
export const topicFor = sn => `device/${sn}/realtime`
// https://www.iammeter.com/newsshow/energy-meter-json-value
// Datas[A,B,C] = volts, amps, watts, import kWh, export kWh, hertz, PF.
export function parse(sn, raw, { receivedAt = Date.now(), retained = false } = {}) {
  sn = sn.toUpperCase()
  if (!BY_SN.has(sn)) throw new Error('Unregistered meter')
  if (retained) throw new Error('Retained message: measurement age cannot be verified')
  if (Buffer.byteLength(raw) > 65536) throw new Error('Payload exceeds 64 KiB')
  let j
  try { j = JSON.parse(raw.toString()) } catch { throw new Error('Invalid JSON') }
  if (j?.SN?.toUpperCase?.() !== sn) throw new Error('Payload SN does not match subscribed topic')
  if (!Array.isArray(j.Datas) || j.Datas.length !== 3) throw new Error('Expected three phase arrays')
  const datas = j.Datas.map((r, p) => {
    // Legacy meter firmware sends decimal strings; accept only strict numeric representations.
    if(Array.isArray(r))r=r.map(x=>typeof x==='string'&&/^-?\d+(?:\.\d+)?$/.test(x)?Number(x):x)
    if (!Array.isArray(r) || r.length < 7 || !r.slice(0,7).every(x => typeof x === 'number' && Number.isFinite(x))) throw new Error(`Phase ${'ABC'[p]}: seven finite numeric fields required`)
    const [v,i,w,ei,eo,hz,pf] = r
    if (v<0 || v>600 || i<0 || i>10000 || Math.abs(w)>6e6 || ei<0 || eo<0 || hz<0 || hz>100 || Math.abs(pf)>1) throw new Error(`Phase ${'ABC'[p]}: invalid measurement range`)
    return r.slice(0,7)
  })
  let deviceTimestamp = null
  if (j.timestamp !== undefined) {
    deviceTimestamp = typeof j.timestamp === 'number' ? j.timestamp : Date.parse(j.timestamp)
    if (!Number.isFinite(deviceTimestamp) || deviceTimestamp<946684800000 || deviceTimestamp>receivedAt+60000) throw new Error('Invalid or future device timestamp')
  }
  const quality = deviceTimestamp === null ? ['RECEPTION_TIME_ONLY'] : []
  for (let p=0;p<3;p++) {
    if (datas[p][0]<40) quality.push(`PHASE_${'ABC'[p]}_LOW_VOLTAGE`)
    if (datas[p][0]>260) quality.push(`PHASE_${'ABC'[p]}_HIGH_VOLTAGE`)
  }
  return {sn,id:BY_SN.get(sn).id,name:BY_SN.get(sn).name,t:deviceTimestamp??receivedAt,receivedAt,deviceTimestamp,
    timeBasis:deviceTimestamp===null?'received':'device',origin:'MEASURED',
    va:datas[0][0],vb:datas[1][0],vc:datas[2][0],ia:datas[0][1],ib:datas[1][1],ic:datas[2][1],
    pfa:datas[0][6],pfb:datas[1][6],pfc:datas[2][6],pKw:datas.reduce((s,p)=>s+p[2],0)/1000,
    freq:datas.reduce((s,p)=>s+p[5],0)/3,energyInKwh:datas.reduce((s,p)=>s+p[3],0),energyOutKwh:datas.reduce((s,p)=>s+p[4],0),
    quality,datas}
}
