import {EventLog} from '@/components/EventLog'
import {DataPath} from '@/components/DataPath'
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { baseOption, EChart, type EOption, useChartTheme } from '@/components/charts/EChart'
import { PageBand } from '@/components/Shell'
import { Icon } from '@/components/ui/symbols'
import { Card, CardHead, fmtTime, SourceBadge, Stat } from '@/components/ui/ui'
import { downstream, forecastNextHours, inferState, LINES, METER_BUS, type MeterState, STATE_META } from '@/lib/grid'
import { useStoredHistory } from '@/lib/history'
import {useForecast} from '@/lib/forecast'
import { computeEnergy, type MeterReading } from '@/lib/models/energy'
import { computeThermal } from '@/lib/models/thermal'
import { MAIN_SN, METERS, meterReading, meterStatus,connectionReason,useStore } from '@/lib/store'
import { GridMap, type LineView, type MeterView } from './GridMap'

const DAY = 86_400_000

export default function MapPage() {
  const st = useStore()
  const navTo = useNavigate()
  const t = useChartTheme()
  const simulation=st.adapter==='demo'
  const bridgeOpen = st.bridge === 'open' && st.broker==='LIVE'
  const [selected, setSelected] = useState<string | null>(MAIN_SN)
  const [scenario,setScenario]=useState('normal')
  const [dataPathOpen,setDataPathOpen]=useState(false)
  const onSelect = useCallback((sn: string | null) => setSelected(sn), [])

  /* ---------- per-meter readings and states (live data only) ---------- */
  const views = useMemo(() => METERS.map((m): { m: { sn: string; name: string; short: string }; mb: typeof METER_BUS[number]; r: MeterReading | null; e: ReturnType<typeof computeEnergy> | null; state: MeterState; kw: number | null } => {
    const mb = METER_BUS.find((x) => x.sn === m.sn)!
    let r = simulation ? meterReading(st,m.sn).latest : bridgeOpen ? st.meters[m.sn]?.latest ?? null : null
    if(simulation&&m.sn===(selected??MAIN_SN)){
      if(scenario==='low-phase'&&r)r={...r,vc:0,ic:0}
      if(scenario==='low-all'&&r)r={...r,va:0,vb:0,vc:0,ia:0,ib:0,ic:0,pKw:0}
      if(scenario==='silent')r=null
    }
    const age = simulation?0:st.now - Math.min(r?.t??0,st.meters[m.sn]?.receivedAt ?? 0)
    const state: MeterState = inferState(r, { live: true, ageMs: age, staleAfterMs:Math.max(st.staleAfterMs,(st.meters[m.sn]?.intervalSeconds??0)*3000),ratedKva: m.sn === MAIN_SN ? 200 : undefined })
    const e = r ? computeEnergy({ t: r.t, va: r.va, vb: r.vb, vc: r.vc, ia: r.ia, ib: r.ib, ic: r.ic, pfa: r.pfa, pfb: r.pfb, pfc: r.pfc, pKw: r.pKw }) : null
    const kw = e && state !== 'nodata' && state !== 'stale' ? e.pKw : null
    return { m, mb, r, e, state, kw }
  }), [st.meters, st.now, bridgeOpen,simulation,st.latest,scenario,selected])

  const byId = useMemo(() => new Map(views.map((v) => [v.m.sn, v])), [views])
  const trafo = byId.get(MAIN_SN)!
  const meterViews: MeterView[] = views.map((v) => ({ sn: v.m.sn, name: v.m.name, short: v.m.short, bus: v.mb.bus, state: v.state, kw: v.kw, verified: v.mb.verified }))

  const lineViews = useMemo(() => {
    const out: Record<string, LineView> = {}
    const ts = trafo.state
    for (const l of LINES) {
      if (l.from === 0) { out[l.id] = { id: l.id, state: ts === 'live' || ts === 'overload' || ts === 'phase-loss' ? 'flow' : 'nodata', kw: trafo.kw }; continue }
      const sub = new Set(downstream(l.to))
      const dm = views.filter((v) => v.m.sn !== MAIN_SN && sub.has(v.mb.bus))
      if (!dm.length) { out[l.id] = { id: l.id, state: 'unmonitored', kw: null }; continue }
      const flowing = dm.filter((v) => ['live', 'overload', 'phase-loss'].includes(v.state))
      if (!flowing.length) { out[l.id] = { id: l.id, state: 'nodata', kw: null, note: 'Downstream meter not reporting.' }; continue }
      out[l.id] = { id: l.id, state: 'flow', kw: flowing.reduce((s, v) => s + (v.kw ?? 0), 0),note:'Estimated downstream demand on study topology; physical line state unknown' }
    }
    return out
  }, [views, trafo])

  /* ---------- summary ---------- */
  const buildings = views.filter((v) => v.m.sn !== MAIN_SN)
  const reporting = buildings.filter((v) => ['live', 'phase-loss', 'overload'].includes(v.state)).length
  const faults = views.filter((v) => ['outage', 'phase-loss', 'overload'].includes(v.state))
  const trafoKw = trafo.kw
  const tsi = trafo.r && trafo.state !== 'stale' ? computeThermal(trafo.r) : null

  /* ---------- selected building: today, yesterday, forecast ---------- */
  const sel = selected ? byId.get(selected) : null
  const d0 = Math.floor((st.now+20700000)/DAY)*DAY-20700000
  const stored = useStoredHistory(sel?.m.sn ?? MAIN_SN, '48h', { from: d0 - DAY, to: d0 + DAY, step: 60_000 })
  const series = useMemo(() => {
    const pts = stored.rows.map((r) => ({ t: r.t, p: computeEnergy(r).pKw }))
    const sessionPts = (sel ? st.meters[sel.m.sn]?.history ?? [] : []).map((r) => ({ t: r.t, p: computeEnergy(r).pKw }))
    const today = (pts.length ? pts : sessionPts).filter((x) => x.t >= d0)
    const yesterday = pts.filter((x) => x.t < d0).map((x) => ({ t: x.t + DAY, p: x.p }))
    return { today, yesterday, all: pts.length ? pts : sessionPts }
  }, [stored.rows, sel?.m.sn, st.meters, d0])
  const persistedForecast=useForecast(selected??MAIN_SN)
  const forecast = useMemo(() => persistedForecast??(sel && sel.kw !== null ? forecastNextHours(series.all, { t: Date.now(), p: sel.kw }, 3) : null), [persistedForecast,series.all, sel?.kw])

  const chartOpt = useMemo<EOption>(() => {
    const b = baseOption(t)
    return {
      ...b,
      legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 3, textStyle: { color: t.ink2, fontSize: 11 } },
      tooltip: { ...(b.tooltip as object), valueFormatter: (v: number) => `${v?.toFixed?.(1)} kW` },
      xAxis: { ...(b.xAxis as object), type: 'time', min: d0, max: Math.max(d0 + 6 * 3600_000, ...(forecast?.points.map((x) => x.t) ?? [d0])) },
      yAxis: { ...(b.yAxis as object), type: 'value', name: 'kW', min: 0 },
      series: [
        { type: 'line', name: 'Yesterday', showSymbol: false, smooth: 0.2, data: series.yesterday.map((x) => [x.t, +x.p.toFixed(2)]), lineStyle: { width: 1.4, color: t.ink3, type: 'dotted' }, itemStyle: { color: t.ink3 } },
        { type: 'line', name: 'Today', showSymbol: false, smooth: 0.2, data: series.today.map((x) => [x.t, +x.p.toFixed(2)]), lineStyle: { width: 2, color: t.steel }, itemStyle: { color: t.steel }, areaStyle: { color: t.alpha('--steel', 0.1) } },
        { type: 'line', name: 'Forecast (3 h)', showSymbol: false, smooth: 0.3, data: (forecast?.points ?? []).map((x) => [x.t, +x.p.toFixed(2)]), lineStyle: { width: 2, type: 'dashed', color: t.ember }, itemStyle: { color: t.ember } },
      ],
    }
  }, [t, series, forecast, d0])

  const ready=(v:typeof views[number])=>v.r&&v.state!=='stale'&&v.state!=='nodata'
  const reading=(v:typeof views[number],key:'va'|'vb'|'vc'|'ia'|'ib'|'ic')=>ready(v)?v.r![key].toFixed(1):'—'
  return <div><PageBand crumbs={[]} title="Campus network" sub="Distribution topology, building demand and meter observability."/><div className="workspace-content page-enter">
    <div className="instrument-metrics"><div><span className="metric-index">Main transformer</span><Stat label="Transformer demand" v={trafoKw} unit="kW"/></div><div><span className="metric-index">Building meters</span><strong>{reporting}<small>/ 6 buildings</small></strong><span>{faults.length} voltage or loading warnings</span></div><div><span className="metric-index">Thermal model</span><Stat label="Thermal sensitivity" v={tsi?.tsiRaw} digits={3}/></div><div><span className="metric-index">Study network</span><strong>{LINES.length}<small>study links</small></strong><span>Physical conductor state unmonitored</span></div></div>
    {simulation&&<div className="map-note"><SourceBadge tag="SIMULATED"/><label htmlFor="map-scenario">Selected meter</label><select id="map-scenario" value={scenario} onChange={e=>setScenario(e.target.value)} className="border hair bg-s1 p-2 rounded"><option value="normal">Normal load</option><option value="low-phase">Low phase C</option><option value="low-all">Low voltage</option><option value="silent">No messages</option></select></div>}
    <section className="map-instrument"><div className="instrument-topline"><div><span className="eyebrow">Kathmandu University / distribution network</span><h3>Network & meter readings</h3></div><span className="database-pill"><Icon name="sensors" size={15}/>{fmtTime(st.now)} NPT</span></div><GridMap className="h-[460px] sm:h-[540px] xl:h-[580px]" meters={meterViews} lines={lineViews} selected={selected} onSelect={onSelect} transformerState={trafo.state}/>
    <div className="map-table-scroll"><table className="map-meter-table"><thead><tr><th>METER / LOCATION</th><th>TELEMETRY</th><th>POWER</th><th>VOLTAGE A / B / C</th><th>CURRENT A / B / C</th><th>OBSERVATION</th></tr></thead><tbody>{views.map(v=><tr key={v.m.sn} className={selected===v.m.sn?'selected':''} onClick={()=>setSelected(v.m.sn)}><td><button onClick={()=>setSelected(v.m.sn)}>{v.m.short}</button></td><td><SourceBadge tag={simulation?'DEMO':meterStatus(st,v.m.sn)}/></td><td>{v.kw===null?'—':`${v.kw.toFixed(2)} kW`}</td><td>{reading(v,'va')} / {reading(v,'vb')} / {reading(v,'vc')} V</td><td>{reading(v,'ia')} / {reading(v,'ib')} / {reading(v,'ic')} A</td><td className="meter-reason">{simulation?'Simulated inputs':meterStatus(st,v.m.sn)==='LIVE'?STATE_META[v.state].explain:connectionReason(st,v.m.sn)}</td></tr>)}</tbody></table></div></section>
    <p className="map-note"><Icon name="help" size={14}/>Arrows estimate downstream demand on study topology. Meter locations require verification; missing messages cannot establish a wire or transformer failure.</p>
    {sel&&<div className="map-analysis-grid"><Card><CardHead title={sel.m.short} sub="Recorded demand / experimental prediction" right={<SourceBadge tag={simulation?'DEMO':meterStatus(st,sel.m.sn)}/>}/>{series.today.length||series.yesterday.length?<EChart option={chartOpt} height={260} ariaLabel="Recorded building demand and forecast"/>:<p className="py-12 text-center text-xs text-ink3">No stored readings for this building in the selected window.</p>}<p className="mt-3 text-xs text-ink3">{forecast?.basis??connectionReason(st,sel.m.sn)}</p></Card><Card><CardHead title="Selected meter" sub={sel.m.short}/><div className="grid grid-cols-2 gap-5"><Stat label="Active power" v={sel.kw} unit="kW"/><Stat label="Apparent power" v={ready(sel)?sel.e?.sKva:null} unit="kVA"/><Stat label="Power factor" v={ready(sel)?sel.e?.pf:null} digits={3}/><Stat label="Current unbalance" v={ready(sel)?sel.e?.cuf:null} unit="%"/></div><p className="mt-6 text-xs text-ink3">{connectionReason(st,sel.m.sn)}</p><button className="console-button mt-5" onClick={()=>{st.setEnergyMeter(sel.m.sn);navTo('/energy/live')}}>Open building analytics <Icon name="arrow_forward" size={16}/></button></Card></div>}
    <div className="mt-5"><EventLog/></div><details className="surface mt-5 p-5" onToggle={e=>setDataPathOpen(e.currentTarget.open)}><summary className="cursor-pointer text-xs font-medium">Communication path / TCP/IP</summary><div className="mt-5">{dataPathOpen&&<DataPath sn={selected??MAIN_SN}/>}</div></details>
  </div></div>
}
