import {useStoredHistory} from '@/lib/history'
import {ConnectionState} from '@/components/ConnectionState'
import {StoredAnalytics} from './StoredAnalytics'
import { lazy, Suspense, useMemo, useState } from 'react'
import { baseOption, type ChartTheme, EChart, type EOption, useChartTheme } from '@/components/charts/EChart'
import { DetailPanel } from '@/components/DetailPanel'
import { DataPath } from '@/components/DataPath'
import { FormulaFlow, type FlowStage } from '@/components/FormulaFlow'
import type { TwinMode, TwinPart } from '@/components/three/Transformer'
import {
  Card, CardHead, cx, Eq, fmtTime, KV, Note, PHASE_COLOR, PHASE_LABEL, PhaseDot, Segmented, SourceBadge, Stat, Value,
} from '@/components/ui/ui'
import { demoSeasonProfile, demoSeries, type Season } from '@/lib/data/demo'
import {
  computeEnergy, ENERGY_CONFIG, ENERGY_REPORTED, hourlyAverage, integrateEnergyKwh, type MeterReading, peakOffPeak,
} from '@/lib/models/energy'
import { MAIN_SN, METERS, meterStatus, type Phase, useStore } from '@/lib/store'
import { studySeason } from '@/lib/grid'
import { useLive } from '@/lib/useLive'

const TransformerTwin = lazy(() => import('@/components/three/Transformer').then((m) => ({ default: m.TransformerTwin })))
const PH = ['a', 'b', 'c'] as const
const SEASON_COLOR = { winter: 'rgb(var(--steel))', summer: 'rgb(var(--sun))', festival: 'rgb(var(--teal))' }

/** Today's readings for the selected meter: live bridge history when available, otherwise scaled demo data. */
function useMeterDay(stepMin = 5) {
  const now = useStore((s) => s.now)
  const sn = useStore((s) => s.energyMeter)
  const adapter = useStore((s) => s.adapter)
  const hist = useStore((s) => s.meters[sn]?.history)
  const slot = Math.floor(now / (stepMin * 60_000))
  return useMemo(() => {
    const d = new Date(now); d.setHours(0, 0, 0, 0)
    if (adapter === 'mqtt') return (hist??[]).filter((x) => x.t >= Math.floor((now+20700000)/86400000)*86400000-20700000)
    const k = METERS.find((m) => m.sn === sn)?.scale ?? 1
    const end = slot * stepMin * 60_000
    return demoSeries(end, end - d.getTime(), stepMin * 60_000).map((x) => (k === 1 ? x : { ...x, ia: x.ia * k, ib: x.ib * k, ic: x.ic * k }))
  }, [slot, stepMin, sn, adapter, hist, now])
}

function useDay(offsetDays = 0, stepMin = 5) {
  const now = useStore((s) => s.now)
  const slot = Math.floor(now / (stepMin * 60_000))
  return useMemo(() => {
    const d = new Date(now); d.setHours(0, 0, 0, 0)
    const start = d.getTime() - offsetDays * 86_400_000
    const end = offsetDays === 0 ? slot * stepMin * 60_000 : start + 86_400_000 - stepMin * 60_000
    return demoSeries(end, end - start, stepMin * 60_000)
  }, [offsetDays, slot, stepMin, now])
}

const energyOf = (rows: MeterReading[],maxGapH:number) => integrateEnergyKwh(rows.map((r) => ({ t: r.t, p: computeEnergy(r).pKw })),maxGapH)

function refLine(t: ChartTheme, y: number, label: string) {
  return { silent: true, symbol: 'none', lineStyle: { color: t.ink3, type: 'dashed' }, label: { color: t.ink3, fontSize: 10, formatter: label, position: 'insideEndTop' }, data: [{ yAxis: y }] }
}

function timeLine(t: ChartTheme, name: string, unit: string, series: { name: string; color: string; data: [number, number][]; area?: boolean; width?: number; opacity?: number }[], mark?: object): EOption {
  const b = baseOption(t)
  return {
    ...b,
    legend: series.length > 1 ? { top: 0, right: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 3, textStyle: { color: t.ink2, fontSize: 11 } } : undefined,
    tooltip: { ...(b.tooltip as object), valueFormatter: (v: number) => `${typeof v === 'number' ? v.toFixed(unit === '%' ? 2 : 1) : v} ${unit}` },
    xAxis: { ...(b.xAxis as object), type: 'time' },
    yAxis: { ...(b.yAxis as object), type: 'value', scale: unit !== 'kW' && unit !== '%', name, min: unit === '%' || unit === 'kW' ? 0 : undefined },
    series: series.map((s, i) => ({
      type: 'line', name: s.name, showSymbol: false, smooth: 0.2, data: s.data,
      lineStyle: { width: s.width ?? 2, color: s.color, opacity: s.opacity ?? 1 }, itemStyle: { color: s.color },
      areaStyle: s.area ? { color: s.color.replace('rgb(', 'rgba(').replace(')', ',0.12)') } : undefined,
      ...(i === 0 && mark ? { markLine: mark } : {}),
    })),
  }
}

/* ================= LIVE ================= */
function Live() {
  const { latest, energy: e, status, live, history, sn } = useLive('energy')
  const isMain = sn === 'main-transformer'
  const sel = useStore((s) => s.selectedPhase)
  const selectPhase = useStore((s) => s.selectPhase)
  const [mode, setMode] = useState<TwinMode>('flow')
  const [chart, setChart] = useState<'demand' | 'i' | 'v'>('demand')
  const t = useChartTheme()
  const demoToday = useMeterDay(5)
  const stored=useStoredHistory(sn,'48h',{step:60000})
  const midnight=Math.floor((Date.now()+20700000)/86400000)*86400000-20700000
  const today=useMemo(()=>stored.rows.length&&status!=='DEMO'?stored.rows.filter(r=>r.t>=midnight):demoToday,[stored.rows,demoToday,status,midnight])
  const yesterdayRaw = useDay(1, 15)
  const kScale = METERS.find((m) => m.sn === sn)?.scale ?? 1
  const adapter=useStore(s=>s.adapter)
  const yesterday = useMemo(() => (adapter==='demo'?yesterdayRaw:stored.rows.filter(r=>r.t<midnight)).map((x) => ({ ...x, ia: x.ia * (adapter==='demo'?kScale:1), ib: x.ib * (adapter==='demo'?kScale:1), ic: x.ic * (adapter==='demo'?kScale:1) })), [yesterdayRaw, kScale,adapter,stored.rows,midnight])
  const twinSel: TwinPart | null = sel ? (`cable-${sel}` as TwinPart) : null
  const onTwinSelect = (p: TwinPart | null) => selectPhase(p && p.startsWith('cable-') ? (p.slice(6) as Phase) : null)

  const option = useMemo(() => {
    if (chart === 'demand') {
      const d0 = new Date(); d0.setHours(0, 0, 0, 0)
      const shift = 86_400_000
      return timeLine(t, 'kW', 'kW', [
        { name: 'Today', color: t.teal, area: true, data: today.map((r) => [r.t, +computeEnergy(r).pKw.toFixed(1)]) },
        { name: adapter==='demo'?'Yesterday (demo)':'Yesterday (stored)', color: t.ink3, width: 1.4, opacity: 0.7, data: yesterday.map((r) => [r.t + shift, +computeEnergy(r).pKw.toFixed(1)]) },
      ], isMain ? refLine(t, ENERGY_CONFIG.benchmarkKw, '160 kW benchmark (200 kVA × assumed PF 0.8)') : undefined)
    }
    const key = chart === 'i' ? ['ia', 'ib', 'ic'] as const : ['va', 'vb', 'vc'] as const
    return timeLine(t, chart === 'i' ? 'A' : 'V', chart === 'i' ? 'A' : 'V', PH.map((p, i) => ({
      name: PHASE_LABEL[p], color: [t.pa, t.pb, t.pc][i], width: sel === p ? 2.6 : sel ? 1.2 : 2, opacity: sel && sel !== p ? 0.35 : 1,
      data: history.map((r) => [r.t, +r[key[i]].toFixed(1)] as [number, number]),
    })))
  }, [chart, t, today, yesterday, history, sel, isMain, status])

  const gapH=useStore(s=>s.adapter==='demo'?1.5:Math.max(s.staleAfterMs,(s.meters[sn]?.intervalSeconds??0)*3000)/3600000)
  const eToday = useMemo(() => energyOf(today,gapH), [today,gapH])
  const eYesterday = useMemo(() => energyOf(yesterday,gapH), [yesterday,gapH])
  const maxI = Math.max(latest.ia, latest.ib, latest.ic)
  const phaseInfo = sel ? { I: latest[`i${sel}` as 'ia'], V: latest[`v${sel}` as 'va'], pf: latest[`pf${sel}` as 'pfa'] } : null

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card pad={false} className="relative overflow-hidden">
          <div className="absolute left-3 right-3 top-3 z-10 flex flex-wrap items-center justify-between gap-2">
            <Segmented size="sm" label="View mode" value={mode} onChange={setMode} options={[{ value: 'flow', label: 'Current flow' }, { value: 'imbalance', label: 'Imbalance' }, { value: 'exterior', label: 'Exterior' }]} />
            <SourceBadge tag={status} />
          </div>
          <Suspense fallback={<div className="h-[380px] animate-pulse bg-s2 sm:h-[460px] lg:h-[560px]" />}>
            <TransformerTwin className="h-[380px] w-full sm:h-[460px] lg:h-[560px]" mode={mode} currents={{ a: latest.ia, b: latest.ib, c: latest.ic }}
              shares={{ a: latest.ia / (maxI || 1), b: latest.ib / (maxI || 1), c: latest.ic / (maxI || 1) }} selected={twinSel} onSelect={onTwinSelect} live={live} autoRotate={mode === 'exterior'} />
          </Suspense>
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-10">
            <div className="inline-block max-w-full rounded-md border hair bg-s1/85 px-3 py-2 text-[11.5px] leading-snug text-ink2 backdrop-blur">
              {mode === 'imbalance' ? <>The most loaded phase is highlighted. <b className="text-ink">CUF {e.cuf?.toFixed(1)} %</b> against the 10 % assessment threshold.</> : <>Particle density and speed are a <b className="text-ink">visual encoding of measured current</b>, not electrons. Tap a cable for its readings.</>}
            </div>
          </div>
          <DetailPanel open={!!sel} onClose={() => selectPhase(null)} title={sel ? PHASE_LABEL[sel] : ''} eyebrow={<span className="flex items-center gap-2">Phase <SourceBadge tag={status} /></span>}>
            {sel && phaseInfo && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Stat label="Voltage" v={phaseInfo.V} unit="V" />
                  <Stat label="Current" v={phaseInfo.I} unit="A" />
                  <Stat label="Active power" v={(phaseInfo.V * phaseInfo.I * phaseInfo.pf) / 1000} unit="kW" />
                  <Stat label="Power factor" v={phaseInfo.pf} digits={3} />
                </div>
                <div className="rounded-md bg-s2 p-3">
                  <div className="text-[12px] text-ink3">Deviation from average current</div>
                  <div className="num mt-1 text-[22px] font-semibold" style={{ color: PHASE_COLOR[sel] }}>{e.deviations[sel] >= 0 ? '+' : ''}{e.deviations[sel].toFixed(1)} %</div>
                  <div className="mt-1 text-[12px] text-ink3">Average {e.iavg.toFixed(1)} A · {e.maxPhase === sel ? 'sets the CUF (largest deviation)' : 'not the largest deviation'}</div>
                </div>
                <KV rows={[['Reading time (NPT)', fmtTime(latest.t, true)]]} />
                <p>The same phase is highlighted in the current chart below.</p>
              </>
            )}
          </DetailPanel>
        </Card>

        <Card className="flex flex-col gap-5">
          <div>
            <div className="flex items-center justify-between"><span className="text-[12px] text-ink2">Active power</span><SourceBadge tag={status} /></div>
            <div className="mt-2"><Value v={e.pKw} unit="kW" size="xl" digits={1} /></div>
            <p className="mt-2 text-[13px] text-ink2">Meter-reported active power; calculated from V, I and PF in simulations.</p>
          </div>
          {!isMain ? <div className="hair-t pt-4"><Stat label="Apparent power (this building)" v={e.sKva} unit="kVA" /><p className="mt-1 text-[12px] text-ink3">Building meter — transformer utilisation applies to the Main Transformer only.</p></div> :
          <div className="hair-t pt-4">
            <div className="mb-2 flex items-baseline justify-between"><span className="text-[12px] text-ink2">Transformer utilisation</span><span className="num text-[13px]"><b className="text-ink">{e.sKva.toFixed(1)}</b> <span className="text-ink3">of 200 kVA</span></span></div>
            <div className="relative h-2.5 overflow-hidden rounded-full bg-s3">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, e.loading)}%`, background: e.loading > 90 ? '#E5484D' : e.loading > 75 ? '#E2C044' : 'rgb(var(--teal))' }} />
            </div>
            <div className="num mt-1.5 text-[12px] text-ink3">{e.loading.toFixed(1)} % apparent loading · rating per reports, verify nameplate</div>
          </div>}
          <div className="grid grid-cols-2 gap-4 hair-t pt-4">
            <div>
              <Stat label="Current unbalance (CUF)" v={e.cuf} unit="%" digits={2} />
              <Gauge value={e.cuf ?? 0} ref_={ENERGY_CONFIG.cufAssessment} max={30} label="10 % assessment" />
            </div>
            <div>
              <Stat label="Voltage unbalance (VUF)" v={e.vuf} unit="%" digits={2} />
              <Gauge value={e.vuf ?? 0} ref_={ENERGY_CONFIG.vufReference} max={3} label="2 % reference" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Power factor" v={e.pf} digits={3} />
            <Stat label="Reactive power" v={e.qKvar} unit="kVAR" />
          </div>
          <Note>{(e.cuf ?? 0) > ENERGY_CONFIG.cufAssessment
            ? <>Current is unevenly shared: <b className="text-ink">{PHASE_LABEL[e.maxPhase]}</b> carries {e.deviations[e.maxPhase].toFixed(0)} % {e.deviations[e.maxPhase] >= 0 ? 'above' : 'below'} the phase average, while voltage stays balanced — a load-side imbalance, as the study found.</>
            : <>Phase currents are within the study's 10 % assessment threshold right now.</>}</Note>
          <div className="space-y-2">
            {PH.map((p) => (
              <button key={p} onClick={() => selectPhase(sel === p ? null : p)} className={cx('focus-ring flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors hover:bg-s2', sel === p && 'bg-s2')}>
                <PhaseDot p={p} /><span className="w-14 text-left text-ink2">{PHASE_LABEL[p]}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-s3"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${(latest[`i${p}` as 'ia'] / (maxI * 1.1)) * 100}%`, background: PHASE_COLOR[p] }} /></div>
                <span className="num w-14 text-right text-ink">{latest[`i${p}` as 'ia'].toFixed(0)} A</span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        <Card><Stat label="Observed energy today" v={eToday} unit="kWh" digits={0} tag={status} hint="Trapezoidal ∫P dt to now" /></Card>
        <Card><Stat label="Yesterday (observed)" v={yesterday.length?eYesterday:null} unit="kWh" digits={0} tag={adapter==='demo'?'DEMO':'REPLAY'} /></Card>
        <Card><Stat label="Peak today" v={peakOffPeak(today.map((r) => ({ t: r.t, p: computeEnergy(r).pKw })))?.peak.p} unit="kW" tag={status} hint={(() => { const pk = peakOffPeak(today.map((r) => ({ t: r.t, p: computeEnergy(r).pKw }))); return pk ? `at ${fmtTime(pk.peak.t).slice(0, 5)}` : '' })()} /></Card>
        <Card><Stat label="Frequency" v={latest.freq} unit="Hz" digits={2} tag={status} /></Card>
      </div>

      <Card>
        <CardHead title={chart === 'demand' ? 'Demand today vs yesterday' : chart === 'i' ? 'Three-phase current' : 'Three-phase voltage'} right={<>
          <Segmented size="sm" label="Chart" value={chart} onChange={setChart} options={[{ value: 'demand', label: 'Demand' }, { value: 'i', label: 'Currents' }, { value: 'v', label: 'Voltages' }]} />
          <SourceBadge tag={status} />
        </>} />
        <EChart option={option} height={300} ariaLabel="Energy live chart" onClick={(p) => { const n = (p as { seriesName?: string }).seriesName; const ph = PH.find((x) => PHASE_LABEL[x] === n); if (ph) selectPhase(ph) }} />
      </Card>
      <TodayProfile />
    </div>
  )
}

function Gauge({ value, ref_, max, label }: { value: number; ref_: number; max: number; label: string }) {
  return (
    <div className="mt-2">
      <div className="relative h-1.5 rounded-full bg-s3">
        <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: value > ref_ ? '#E2C044' : 'rgb(var(--teal))' }} />
        <div className="absolute -top-1 h-3.5 w-px bg-ink2" style={{ left: `${(ref_ / max) * 100}%` }} />
      </div>
      <div className="mt-1 text-[10.5px] text-ink3">{label}</div>
    </div>
  )
}

/* ================= QUALITY ================= */
function Quality() {
  const t = useChartTheme()
  const today = useMeterDay(15)
  const rows = useMemo(() => today.map((r) => ({ t: r.t, e: computeEnergy(r), r })), [today])
  const { latest, energy: e, status } = useLive('energy')
  const balOption = useMemo<EOption>(() => {
    const b = baseOption(t)
    return {
      ...b,
      tooltip: { ...(b.tooltip as object), axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${v.toFixed(1)} A` },
      xAxis: { ...(b.xAxis as object), type: 'category', data: PH.map((p) => PHASE_LABEL[p]) },
      yAxis: { ...(b.yAxis as object), type: 'value', name: 'A', min: 0 },
      series: [{
        type: 'bar', barWidth: '42%', data: PH.map((p, i) => ({ value: +latest[`i${p}` as 'ia'].toFixed(1), itemStyle: { color: [t.pa, t.pb, t.pc][i], borderRadius: [4, 4, 0, 0] } })),
        markLine: { silent: true, symbol: 'none', lineStyle: { color: t.ink2, type: 'dashed' }, label: { formatter: `Average ${e.iavg.toFixed(1)} A`, color: t.ink2, fontSize: 11, position: 'insideEndTop' }, data: [{ yAxis: +e.iavg.toFixed(1) }] },
      }],
    }
  }, [t, latest, e.iavg])
  return (
    <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHead title="Current unbalance factor" sub="Today · 15-minute values" right={<SourceBadge tag={status} />} />
          <EChart option={timeLine(t, '%', '%', [{ name: 'CUF', color: t.sun, area: true, data: rows.map((x) => [x.t, +(x.e.cuf ?? 0).toFixed(2)]) }], refLine(t, 10, '10 % assessment threshold (study, not a standard)'))} height={260} ariaLabel="CUF trend" />
        </Card>
        <Card>
          <CardHead title="Voltage unbalance factor" sub="Today · 15-minute values" right={<SourceBadge tag={status} />} />
          <EChart option={(() => { const o = timeLine(t, '%', '%', [{ name: 'VUF', color: t.teal, area: true, data: rows.map((x) => [x.t, +(x.e.vuf ?? 0).toFixed(3)]) }], refLine(t, 2, '2 % reference (IEC 61000-3-13)')); return { ...o, yAxis: { ...(o.yAxis as object), max: 2.5 } } })()} height={260} ariaLabel="VUF trend" />
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
        <Card>
          <CardHead title="Current balance now" right={<SourceBadge tag={status} />} />
          <EChart option={balOption} height={240} ariaLabel="Phase current balance" />
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            {PH.map((p) => <div key={p}><div className="text-[11px] text-ink3">{PHASE_LABEL[p]}</div><div className="num text-[15px] font-semibold" style={{ color: PHASE_COLOR[p] }}>{e.deviations[p] >= 0 ? '+' : ''}{e.deviations[p].toFixed(1)} %</div></div>)}
          </div>
        </Card>
        <Card>
          <CardHead title="Power factor" sub="Measured per phase · today" right={<SourceBadge tag={status} />} />
          <EChart option={(() => { const o = timeLine(t, 'PF', '', PH.map((p, i) => ({ name: PHASE_LABEL[p], color: [t.pa, t.pb, t.pc][i], width: 1.6, data: rows.map((x) => [x.t, +x.r[`pf${p}` as 'pfa'].toFixed(3)] as [number, number]) }))); return { ...o, yAxis: { ...(o.yAxis as object), min: 0.75, max: 1 } } })()} height={240} ariaLabel="Power factor trend" />
        </Card>
      </div>
      <Card>
        <CardHead title="Definitions" sub="How each quantity on this page is calculated and used" />
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { k: 'Voltage unbalance', tex: 'VUF=\\frac{\\max_i|V_i-\\bar V|}{\\bar V}\\times100', use: 'Largest phase-voltage deviation from the average. Compared with the 2 % reference.' },
            { k: 'Current unbalance', tex: 'CUF=\\frac{\\max_i|I_i-\\bar I|}{\\bar I}\\times100', use: 'Largest phase-current deviation from the average. Above 10 % means loads should be moved between phases.' },
            { k: 'Power factor', tex: 'PF=\\frac{P}{S}=\\frac{\\sum V_iI_i\\cos\\varphi_i}{\\sum V_iI_i}', use: 'Share of apparent power doing useful work. Low PF raises current and kVA loading.' },
          ].map((d) => (
            <div key={d.k} className="rounded-lg border hair bg-s2/60 p-4">
              <div className="text-[13px] font-semibold text-ink">{d.k}</div>
              <div className="my-3 overflow-x-auto"><Eq tex={d.tex} /></div>
              <p className="text-[12.5px] leading-relaxed text-ink2">{d.use}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

/* ================= TODAY'S PROFILE (part of Live) ================= */
function TodayProfile() {
  const t = useChartTheme()
  const today = useMeterDay(15)
  const status = useStore((st) => meterStatus(st, st.energyMeter))
  const hourly = useMemo(() => hourlyAverage(today.map((r) => ({ t: r.t, p: computeEnergy(r).pKw }))), [today])
  const pk = peakOffPeak(hourly)
  const pqs = useMemo(() => today.map((r) => ({ t: r.t, e: computeEnergy(r) })), [today])
  const hourlyOpt = useMemo<EOption>(() => {
    const b = baseOption(t)
    return {
      ...b,
      tooltip: { ...(b.tooltip as object), axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${v.toFixed(1)} kW` },
      xAxis: { ...(b.xAxis as object), type: 'category', data: hourly.map((h) => `${String(new Date(h.t).getHours()).padStart(2, '0')}:00`) },
      yAxis: { ...(b.yAxis as object), type: 'value', name: 'kW', min: 0 },
      series: [{ type: 'bar', barWidth: '62%', data: hourly.map((h, i) => ({ value: +h.p.toFixed(1), itemStyle: { color: i === pk?.peakIndex ? t.ember : i === pk?.offIndex ? t.steel : t.alpha('--teal', 0.6), borderRadius: [2, 2, 0, 0] } })) }],
    }
  }, [t, hourly, pk])
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHead title="Hourly profile today" sub={pk ? `Peak ${pk.peak.p.toFixed(1)} kW at ${String(new Date(pk.peak.t+20700000).getUTCHours()).padStart(2, '0')}:00 · lowest ${pk.off.p.toFixed(1)} kW at ${String(new Date(pk.off.t+20700000).getUTCHours()).padStart(2, '0')}:00` : ''} right={<SourceBadge tag={status} />} />
        <EChart option={hourlyOpt} height={250} ariaLabel="Hourly load profile" />
      </Card>
      <Card>
        <CardHead title="Active, apparent and reactive power today" right={<SourceBadge tag={status} />} />
        <EChart option={timeLine(t, 'kW · kVA · kVAR', '', [
          { name: 'P (kW)', color: t.teal, area: true, data: pqs.map((x) => [x.t, +x.e.pKw.toFixed(1)]) },
          { name: 'S (kVA)', color: t.ink2, width: 1.5, data: pqs.map((x) => [x.t, +x.e.sKva.toFixed(1)]) },
          { name: 'Q (kVAR)', color: t.pc, width: 1.5, data: pqs.map((x) => [x.t, +x.e.qKvar.toFixed(1)]) },
        ])} height={250} ariaLabel="Active apparent and reactive power" />
      </Card>
    </div>
  )
}

/* ================= FORMULA FLOW ================= */
function energyStages(d: { r: MeterReading; isMain: boolean }): FlowStage[] {
  const { r, isMain } = d
  const e = computeEnergy(r)
  const f = (x: number, k = 1) => x.toFixed(k)
  const chip = (ok: boolean, okT: string, badT: string) => <span className={ok ? 'text-ok' : 'text-warn'}>{ok ? okT : badT}</span>
  return [
    { id: 'in', title: 'Meter reading', explain: 'Per-phase values arrive in every MQTT message.',
      items: [
        { label: 'Voltage A · B · C', value: `${f(r.va)} · ${f(r.vb)} · ${f(r.vc)} V` },
        { label: 'Current A · B · C', value: `${f(r.ia)} · ${f(r.ib)} · ${f(r.ic)} A` },
        { label: 'Power factor', value: `${f(r.pfa, 2)} · ${f(r.pfb, 2)} · ${f(r.pfc, 2)}` },
      ] },
    { id: 'avg', title: 'Phase averages', explain: 'Each phase is compared against these averages.',
      items: [
        { label: 'Average voltage', tex: '\\bar V=\\tfrac{V_a+V_b+V_c}{3}', sub: `=\\tfrac{${f(r.va)}+${f(r.vb)}+${f(r.vc)}}{3}`, value: `${f(e.vavg, 1)} V` },
        { label: 'Average current', tex: '\\bar I=\\tfrac{I_a+I_b+I_c}{3}', sub: `=\\tfrac{${f(r.ia)}+${f(r.ib)}+${f(r.ic)}}{3}`, value: `${f(e.iavg, 1)} A` },
      ] },
    { id: 'pow', title: 'Power', explain: 'P uses measured PF; S is V·I summed over phases.',
      items: [
        { label: 'Active power', tex: 'P=\\tfrac{\\sum V_iI_iPF_i}{1000}', value: `${f(e.pKw)} kW` },
        { label: 'Apparent power', tex: 'S=\\tfrac{\\sum V_iI_i}{1000}', value: `${f(e.sKva)} kVA` },
        { label: 'Reactive power', tex: 'Q=\\sqrt{S^2-P^2}', value: `${f(e.qKvar)} kVAR` },
      ] },
    { id: 'pq', title: 'Power quality', explain: 'Largest phase deviation as a share of the average.',
      items: [
        { label: 'Current unbalance', tex: `CUF=\\tfrac{\\max|I_i-\\bar I|}{\\bar I}\\times100`, value: `${f(e.cuf ?? 0, 2)} %` },
        { label: 'Voltage unbalance', tex: `VUF=\\tfrac{\\max|V_i-\\bar V|}{\\bar V}\\times100`, value: `${f(e.vuf ?? 0, 2)} %` },
        ...(isMain ? [{ label: 'Transformer loading', tex: `\\tfrac{S}{200}\\times100`, value: `${f(e.loading)} %` }] : []),
      ] },
    { id: 'assess', title: 'Assessment', explain: 'Checked against 10 % CUF and 2 % VUF.',
      items: [
        { label: 'CUF vs 10 %', value: chip((e.cuf ?? 0) <= 10, 'Within', 'Above') },
        { label: 'VUF vs 2 %', value: chip((e.vuf ?? 0) <= 2, 'Within', 'Above') },
        ...(isMain ? [{ label: 'Loading vs 100 %', value: chip(e.loading <= 100, 'Within rating', 'Over rating') }] : []),
        { label: 'Most loaded phase', value: PHASE_LABEL[e.maxPhase] },
      ] },
  ]
}

function EnergyFormula() {
  const { latest, status, sn } = useLive('energy')
  return <FormulaFlow data={{ r: latest, isMain: sn === MAIN_SN }} pulseKey={`${sn}-${latest.t}`} build={energyStages} tag={status} title="From meter reading to power-quality assessment" />
}

/* ================= SIMULATION ================= */
/* ================= SEASONS ================= */
export function Seasons() {
  const t = useChartTheme()
  const [season, setSeason] = useState<Season>('winter')
  const [kind, setKind] = useState<'weekday' | 'weekend' | 'overall'>('weekday')
  const S = ENERGY_REPORTED.seasons
  const cur = S.find((s) => s.id === season)!
  const profOpt = useMemo<EOption>(() => {
    const b = baseOption(t)
    const hours = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)
    return {
      ...b,
      legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 3, textStyle: { color: t.ink2, fontSize: 11 } },
      tooltip: { ...(b.tooltip as object), valueFormatter: (v: number) => `${v.toFixed(0)} kW` },
      xAxis: { ...(b.xAxis as object), type: 'category', data: hours, boundaryGap: false },
      yAxis: { ...(b.yAxis as object), type: 'value', name: 'kW', min: 0, max: 180 },
      series: S.map((s) => {
        const active = s.id === season
        const color = { winter: t.steel, summer: t.sun, festival: t.teal }[s.id as Season]
        // published anchors: weekday peak (Fig. 2) or overall peak/off-peak (Table IV); weekend has no published values
        const hi = kind === 'weekday' ? s.weekdayPeakKw : kind === 'overall' ? s.peakKw : s.peakKw * 0.8
        const lo = kind === 'weekend' ? s.offKw * 0.95 : s.offKw
        const marks = kind === 'overall'
          ? [{ name: `Peak ${s.peakKw} kW (Table IV)`, coord: [s.peakHour, s.peakKw] }, { name: `Off-peak ${s.offKw} kW (Table IV)`, coord: [s.offHour, s.offKw] }]
          : kind === 'weekday' ? [{ name: `≈${s.weekdayPeakKw} kW weekday peak (Fig. 2)`, coord: [s.peakHour, s.weekdayPeakKw] }] : []
        return {
          type: 'line', name: s.label, smooth: 0.35, showSymbol: false,
          data: demoSeasonProfile(lo, hi).map((v) => +v.toFixed(1)),
          lineStyle: { width: active ? 2.6 : 1.2, color, opacity: active ? 1 : 0.35 }, itemStyle: { color },
          areaStyle: active ? { color: t.alpha(s.id === 'winter' ? '--steel' : s.id === 'summer' ? '--sun' : '--teal', 0.12) } : undefined,
          markPoint: active && marks.length ? { symbol: 'circle', symbolSize: 9, label: { show: true, color: t.ink, fontSize: 11, position: 'top', distance: 8, formatter: (q: { name: string }) => q.name }, itemStyle: { color, borderColor: t.s1, borderWidth: 2 }, data: marks } : undefined,
          markLine: active ? refLine(t, 160, '160 kW benchmark (assumed PF 0.8)') : undefined,
        }
      }),
    }
  }, [t, season, kind, S])
  const mainHist = useStore((st) => st.meters[MAIN_SN]?.history)
  const adapter = useStore((st) => st.adapter)
  const demoToday = useDay(0, 15)
  const todayMain = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0)
    return adapter === 'mqtt' && mainHist?.length ? mainHist.filter((x) => x.t >= d.getTime()) : demoToday
  }, [adapter, mainHist, demoToday])
  const nowSeason = ENERGY_REPORTED.seasons.find((x) => x.id === studySeason(new Date()))!
  const todayP = todayMain.map((r) => ({ t: r.t, p: computeEnergy(r).pKw }))
  const todayPk = peakOffPeak(todayP)
  const todayMean = todayP.length ? todayP.reduce((s2, x) => s2 + x.p, 0) / todayP.length : 0
  const liveTag = adapter === 'mqtt' && mainHist?.length ? 'LIVE' : 'DEMO'
  return (
    <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Season" value={season} onChange={setSeason} options={S.map((s) => ({ value: s.id as Season, label: s.label }))} />
        <Segmented size="sm" label="Day type" value={kind} onChange={setKind} options={[{ value: 'weekday', label: 'Weekday' }, { value: 'weekend', label: 'Weekend' }, { value: 'overall', label: 'Overall' }]} />
      </div>
      <Card>
        <CardHead title={`Today against the ${nowSeason.label.toLowerCase()} reference`} sub="Main transformer today compared with the study's published values for the current season" right={<><SourceBadge tag={liveTag as 'LIVE' | 'DEMO'} /><SourceBadge tag="REPORTED" /></>} />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Today's peak so far" v={todayPk?.peak.p} unit="kW" hint={todayPk ? `at ${fmtTime(todayPk.peak.t).slice(0, 5)}` : undefined} />
          <Stat label={`${nowSeason.label} peak (Table IV)`} v={nowSeason.peakKw} unit="kW" digits={0} hint={`at ${String(nowSeason.peakHour).padStart(2, '0')}:00`} />
          <Stat label="Today's mean so far" v={todayMean} unit="kW" />
          <Stat label={`${nowSeason.label} mean (Fig. 6)`} v={nowSeason.meanKw} unit="kW" />
        </div>
        {todayPk && <p className="mt-3 text-[13px] text-ink2">Today's peak is <b className="text-ink">{(((todayPk.peak.p - nowSeason.peakKw) / nowSeason.peakKw) * 100).toFixed(0)} %</b> {todayPk.peak.p >= nowSeason.peakKw ? 'above' : 'below'} the published {nowSeason.label.toLowerCase()} peak.</p>}
      </Card>
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHead title="Average daily load profile" sub="Illustrative study comparison" right={<><SourceBadge tag="DEMO" /><SourceBadge tag="REPORTED" /></>} />
          <EChart option={profOpt} height={320} ariaLabel="Seasonal daily load profiles" />
        </Card>
        <Card className="flex flex-col gap-4">
          <div><div className="text-[12px]" style={{ color: SEASON_COLOR[season] }}>{cur.label}</div><p className="mt-1 text-[13px] text-ink2">{cur.note}</p></div>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Peak (Table IV)" v={cur.peakKw} unit="kW" digits={0} hint={`at ${String(cur.peakHour).padStart(2, '0')}:00`} />
            <Stat label="Off-peak (Table IV)" v={cur.offKw} unit="kW" digits={0} hint={`at ${String(cur.offHour).padStart(2, '0')}:00`} />
            <Stat label="Weekday peak (Fig. 2)" v={cur.weekdayPeakKw} unit="kW" digits={0} hint="approximate" />
            <Stat label="Mean hourly power (Fig. 6)" v={cur.meanKw} unit="kW" digits={1} />
            <Stat label="Mean VUF (Table V)" v={cur.vuf} unit="%" digits={2} />
            <Stat label="Mean CUF (Table V)" v={cur.cuf} unit="%" digits={2} />
          </div>
          {season === 'festival' && <Note>The festival off-peak falls at 17:00 rather than early morning: daytime occupancy is minimal while background loads such as security lighting and servers persist.</Note>}
        </Card>
      </div>
    </div>
  )
}

function DataPathSel() { const sn = useStore((s) => s.energyMeter); return <DataPath sn={sn} /> }

/** Building selector: each IAMMETER meter is its own MQTT stream. */
function MeterPicker() {
  const st = useStore()
  const sn = st.energyMeter
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <label htmlFor="meter-pick" className="text-[12px] text-ink2">Meter</label>
      <select id="meter-pick" value={sn} onChange={(e) => st.setEnergyMeter(e.target.value)}
        className="focus-ring rounded-md border hair bg-s1 px-3 py-2 text-[13px] font-medium text-ink">
        {METERS.map((m) => <option key={m.sn} value={m.sn}>{m.short}</option>)}
      </select>
      <SourceBadge tag={meterStatus(st, sn)} />
      {st.adapter === 'demo' && sn !== METERS[0].sn && <span className="text-[12px] text-ink3">Demo values scaled for this building until the live bridge connects.</span>}
    </div>
  )
}

export default function EnergyPage({ section }: { section: string }) {
  const d=useLive('energy')
  if(!d.latest.t && ['live','quality','model'].includes(section)) return <><MeterPicker/><ConnectionState project="energy"/></>
  switch (section) {
    case 'quality': return <><MeterPicker /><Quality /></>
    case 'model': return <><MeterPicker /><EnergyFormula /></>
    case 'seasons': case 'history': return <><MeterPicker/><StoredAnalytics seasonal={section==='seasons'}/></>
    case 'dataflow': return <><MeterPicker /><DataPathSel /></>
    default: return <><MeterPicker /><Live /></>
  }
}
