import {ConnectionState} from '@/components/ConnectionState'
import { lazy, Suspense, useMemo, useState } from 'react'
import { baseOption, type ChartTheme, EChart, type EOption, useChartTheme } from '@/components/charts/EChart'
import { DetailPanel } from '@/components/DetailPanel'
import { PlaybackBar, usePlayback } from '@/components/Playback'
import { DataPath } from '@/components/DataPath'
import { FormulaFlow, type FlowStage } from '@/components/FormulaFlow'
import { IconDownload } from '@/components/ui/icons'
import {
  Card, CardHead, cx, Disclosure, Eq, fmtTime, KV, Note, PHASE_COLOR, PHASE_LABEL, PhaseDot,
  Segmented, Slider, SourceBadge, Stat, Value,
} from '@/components/ui/ui'
import { Sparkline, TsiScale } from '@/components/ui/viz'
import { type HistRange, useStoredHistory } from '@/lib/history'
import type { MeterReading } from '@/lib/models/energy'
import { apparentPowerKva } from '@/lib/models/energy'
import {
  categoryMeta, computeThermal, type PhaseReading, THERMAL_MODEL, type ThermalResult, TSI_CATEGORIES,
} from '@/lib/models/thermal'
import type { SourceTag } from '@/lib/store'
import { MAIN_SN, useStore } from '@/lib/store'
import { useLive } from '@/lib/useLive'
import type { TwinMode, TwinPart } from '@/components/three/Transformer'

const TransformerTwin = lazy(() => import('@/components/three/Transformer').then((m) => ({ default: m.TransformerTwin })))

const DISCLAIMER = 'Model-derived thermal sensitivity calculated from electrical measurements — not a measured winding, oil or hotspot temperature.'

function Twin(props: Parameters<typeof TransformerTwin>[0]) {
  return <Suspense fallback={<div className={cx('animate-pulse rounded-lg bg-s2', props.className)} />}><TransformerTwin {...props} /></Suspense>
}

/* ---------------- chart builders ---------------- */
function tsiBands(t: ChartTheme) {
  return TSI_CATEGORIES.map((c) => [{ yAxis: c.from, itemStyle: { color: t.alpha('--line', 0) } }, { yAxis: c.to, itemStyle: { color: c.color + '14' } }])
}

function tsiOption(t: ChartTheme, rows: { t: number; r: ThermalResult }[]): EOption {
  const b = baseOption(t)
  return {
    ...b,
    tooltip: { ...(b.tooltip as object), valueFormatter: (v: number) => (typeof v === 'number' ? v.toFixed(3) : v) },
    xAxis: { ...(b.xAxis as object), type: 'time' },
    yAxis: { ...(b.yAxis as object), type: 'value', min: (v: { min: number }) => Math.min(0, Math.floor(v.min * 10) / 10), max: (v: { max: number }) => Math.max(1, Math.ceil(v.max * 10) / 10), name: 'TSI' },
    series: [{
      type: 'line', name: 'TSI', showSymbol: false, smooth: 0.25, lineStyle: { width: 2, color: t.ink },
      data: rows.map((x) => [x.t, +x.r.tsiRaw.toFixed(4)]),
      markArea: { silent: true, data: tsiBands(t) },
    }],
  }
}

function phaseOption(t: ChartTheme, rows: MeterReading[], kind: 'i' | 'v', selected: string | null): EOption {
  const b = baseOption(t)
  const key = kind === 'i' ? (['ia', 'ib', 'ic'] as const) : (['va', 'vb', 'vc'] as const)
  const ph = ['a', 'b', 'c'] as const
  return {
    ...b,
    legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 3, textStyle: { color: t.ink2, fontSize: 11 } },
    tooltip: { ...(b.tooltip as object), valueFormatter: (v: number) => `${v.toFixed(1)} ${kind === 'i' ? 'A' : 'V'}` },
    xAxis: { ...(b.xAxis as object), type: 'time' },
    yAxis: { ...(b.yAxis as object), type: 'value', scale: true, name: kind === 'i' ? 'A' : 'V' },
    series: ph.map((p, i) => ({
      type: 'line', name: PHASE_LABEL[p], showSymbol: false, smooth: 0.2,
      lineStyle: { width: selected && selected !== `w${p}` ? 1 : 2, color: [t.pa, t.pb, t.pc][i], opacity: selected && selected !== `w${p}` ? 0.35 : 1 },
      itemStyle: { color: [t.pa, t.pb, t.pc][i] },
      data: rows.map((r) => [r.t, +r[key[i]].toFixed(2)]),
      ...(kind === 'v' && i === 0 ? { markLine: { silent: true, symbol: 'none', lineStyle: { color: t.ink3, type: 'dashed' }, label: { color: t.ink3, fontSize: 10, formatter: 'Vref 240.0981 V' }, data: [{ yAxis: THERMAL_MODEL.vRef }] } } : {}),
    })),
  }
}

function loadingOption(t: ChartTheme, rows: MeterReading[]): EOption {
  const b = baseOption(t)
  return {
    ...b,
    tooltip: { ...(b.tooltip as object), valueFormatter: (v: number) => `${v.toFixed(1)} %` },
    xAxis: { ...(b.xAxis as object), type: 'time' },
    yAxis: { ...(b.yAxis as object), type: 'value', name: '% of 200 kVA', min: 0 },
    series: [{ type: 'line', name: 'Apparent loading', showSymbol: false, smooth: 0.2, lineStyle: { width: 2, color: t.steel }, areaStyle: { color: t.alpha('--steel', 0.12) }, data: rows.map((r) => [r.t, +(apparentPowerKva(r) / 2).toFixed(2)]) }],
  }
}

function waterfallOption(t: ChartTheme, r: ThermalResult): EOption {
  const b = baseOption(t)
  const steps = [
    { name: 'Intercept', v: r.terms.intercept },
    { name: 'I²eq term', v: r.terms.current },
    { name: 'Iimb term', v: r.terms.imbalance },
    { name: 'Vdev term', v: r.terms.voltage },
  ]
  let acc = 0
  const base: number[] = [], pos: (number | string)[] = [], neg: (number | string)[] = []
  for (const s of steps) {
    const start = acc, end = acc + s.v
    base.push(Math.min(start, end))
    if (s.v >= 0) { pos.push(+s.v.toFixed(5)); neg.push('-') } else { neg.push(+(-s.v).toFixed(5)); pos.push('-') }
    acc = end
  }
  const lo = Math.min(0, ...base, acc) - 0.1
  return {
    ...b,
    grid: { ...(b.grid as object), top: 16 },
    tooltip: { ...(b.tooltip as object), trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps: { dataIndex: number }[]) => {
      const i = ps[0].dataIndex
      if (i === 4) return `θ<sub>1hr</sub> = <b>${r.theta.toFixed(5)}</b>`
      return `${steps[i].name}: <b>${steps[i].v >= 0 ? '+' : ''}${steps[i].v.toFixed(5)}</b>`
    } },
    xAxis: { ...(b.xAxis as object), type: 'category', data: [...steps.map((s) => s.name), 'θ1hr'] },
    yAxis: { ...(b.yAxis as object), type: 'value', min: +lo.toFixed(1) },
    series: [
      { type: 'bar', stack: 'w', itemStyle: { color: 'transparent' }, emphasis: { disabled: true }, data: [...base.map((x) => +x.toFixed(5)), Math.min(0, r.theta)], barWidth: '46%' },
      { type: 'bar', stack: 'w', name: 'Increase', itemStyle: { color: t.ember, borderRadius: 3 }, data: [...pos, r.theta >= 0 ? +r.theta.toFixed(5) : '-'] },
      { type: 'bar', stack: 'w', name: 'Decrease', itemStyle: { color: t.steel, borderRadius: 3 }, data: [...neg, r.theta < 0 ? +(-r.theta).toFixed(5) : '-'] },
    ],
  }
}

/* ---------------- shared pieces ---------------- */
type TrendRange = 'live' | HistRange
const RANGES: { value: TrendRange; label: string }[] = [{ value: 'live', label: 'Live' }, { value: '24h', label: '24 h' }, { value: '7d', label: '7 d' }, { value: '30d', label: '30 d' }]

/** Live = readings received in this session; longer ranges come from the bridge's stored history. */
function useTrendRows(range: TrendRange) {
  const history = useStore((s) => s.history)
  const stored = useStoredHistory(MAIN_SN, range === 'live' ? '24h' : range)
  if (range === 'live') return { rows: history as MeterReading[], state: 'ok' as const, coverage: null }
  return stored
}

function NoHistory({ state }: { state: 'loading' | 'empty' | 'offline' | 'ok' }) {
  return (
    <div className="grid h-[260px] place-items-center rounded-md border border-dashed hair px-6 text-center text-[13px] text-ink2">
      {state === 'loading' ? 'Loading stored history…'
        : state === 'empty' ? 'Nothing stored for this period yet. The bridge records every reading from the moment it starts.'
          : 'Stored history comes from the live bridge on the lab PC. Start it with “npm start” in the server folder.'}
    </div>
  )
}

function ExplainTsi({ r }: { r: ThermalResult }) {
  const drivers = [
    { k: 'current-squared loading', v: r.terms.current },
    { k: 'current imbalance', v: r.terms.imbalance },
    { k: 'voltage deviation', v: r.terms.voltage },
  ].sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
  return <>driven mainly by <span className="text-ink">{drivers[0].k}</span></>
}

/* ---------------- detail panel ---------------- */
function PartDetail({ part, r, reading, tag, onClose }: { part: TwinPart | null; r: ThermalResult; reading: PhaseReading & { t?: number }; tag: SourceTag; onClose: () => void }) {
  const cat = categoryMeta(r.category)
  const phase = part && part.startsWith('w') ? (part[1] as 'a' | 'b' | 'c') : null
  const I = phase ? reading[`i${phase}` as 'ia'] : 0
  const V = phase ? reading[`v${phase}` as 'va'] : 0
  const titles: Record<string, string> = { tank: 'Transformer tank', cooling: 'Radiators and cooling', bushings: 'HV and LV bushings', core: 'Three-limb core', wa: 'Phase A winding', wb: 'Phase B winding', wc: 'Phase C winding' }
  return (
    <DetailPanel open={!!part} onClose={onClose} title={part ? titles[part] ?? 'Component' : ''} eyebrow={<span className="flex items-center gap-2">Component <SourceBadge tag={tag} /></span>}>
      {phase && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Current" v={I} unit="A" />
            <Stat label="Voltage" v={V} unit="V" />
            <Stat label="Share of I²" v={r.phaseShares[phase] * 100} unit="%" />
            <Stat label="vs average current" v={r.iavg > 0 ? ((I - r.iavg) / r.iavg) * 100 : 0} unit="%" />
          </div>
          <div>
            <div className="mb-1 text-[12px] text-ink3">Contribution to I²eq</div>
            <Eq tex={`\\frac{I_${phase.toUpperCase()}^2}{3} = \\frac{${I.toFixed(1)}^2}{3} = ${((I * I) / 3).toFixed(0)}\\ \\text{A}^2`} />
          </div>
          <div className="space-y-1.5">
            {(['a', 'b', 'c'] as const).map((p) => (
              <div key={p} className="flex items-center gap-2 text-[12px]">
                <PhaseDot p={p} /><span className="w-14 text-ink2">{PHASE_LABEL[p]}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-s3"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${r.phaseShares[p] * 100}%`, background: PHASE_COLOR[p] }} /></div>
                <span className="num w-12 text-right text-ink">{(r.phaseShares[p] * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
          <p>Winding copper loss grows with the square of current (P = I²R), so a phase carrying more current contributes disproportionately to heating. The emphasis shown is <b className="text-ink">measured electrical loading</b>; the model does not estimate separate winding temperatures.</p>
        </>
      )}
      {part === 'tank' && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="TSI" v={r.tsiRaw} digits={3} />
            <Stat label="θ₁hr (indicator)" v={r.theta} digits={3} />
            <Stat label="Apparent power" v={apparentPowerKva(reading)} unit="kVA" />
            <Stat label="Loading" v={apparentPowerKva(reading) / 2} unit="%" />
          </div>
          <div className="text-[13px]">Condition: <b style={{ color: cat.color }}>{cat.label}</b></div>
          <p>The tank holds the core, windings and insulating oil, and carries heat to the radiators. Tank and oil temperatures are <b className="text-ink">not measured</b> by this model; the index summarises electrical loading conditions.</p>
          {reading.t && <KV rows={[['Reading time (NPT)', fmtTime(reading.t, true)], ['Model version', r.version]]} />}
        </>
      )}
      {part === 'cooling' && (
        <>
          <p>Radiators increase the surface area through which oil sheds heat to the air, so cooling capacity strongly shapes real winding and oil temperatures.</p>
          <p>The study does <b className="text-ink">not</b> model cooling or ambient temperature, and no cooling telemetry is available. No cooling performance figure is shown because none is supported by data.</p>
          <Note>Future work in the report: add ambient and oil temperature measurements to validate and extend the model.</Note>
        </>
      )}
      {part === 'bushings' && (
        <>
          <p>High-voltage bushings (11 kV side, three phases) and low-voltage bushings (0.4 kV side, three phases plus neutral) carry conductors through the grounded tank cover.</p>
          <p>The Main Transformer meter supplies these inputs. Confirm its measurement side and CT placement on site.</p>
        </>
      )}
      {part === 'core' && (
        <>
          <p>The laminated three-limb steel core carries the magnetic flux linking the windings of each phase. Core loss depends mainly on voltage and frequency rather than load current.</p>
          <p>The model represents voltage effects only through the deviation from the 240.0981 V reference.</p>
        </>
      )}
    </DetailPanel>
  )
}

/* ================= OVERVIEW ================= */
function Overview() {
  const { latest, thermal: r, prevThermal, cat, status, history, live, receivedAt } = useLive()
  const [mode, setMode] = useState<TwinMode>('thermal')
  const [part, setPart] = useState<TwinPart | null>(null)
  const [chart, setChart] = useState<'tsi' | 'i' | 'v' | 'load'>('tsi')
  const [range, setRange] = useState<TrendRange>('live')
  const trend = useTrendRows(range)
  const rows = trend.rows
  const t = useChartTheme()
  const thermalRows = useMemo(() => rows.map((x) => ({ t: x.t, r: computeThermal(x) })), [rows])
  const spark = useMemo(() => history.map((x) => computeThermal(x).tsiRaw), [history])
  const delta = prevThermal ? r.tsiRaw - prevThermal.tsiRaw : 0
  const option = useMemo(() => {
    if (chart === 'tsi') return tsiOption(t, thermalRows)
    if (chart === 'load') return loadingOption(t, rows)
    return phaseOption(t, rows, chart, part)
  }, [chart, t, thermalRows, rows, part])
  const termMax = Math.max(Math.abs(r.terms.current), Math.abs(r.terms.imbalance), Math.abs(r.terms.voltage), 0.01)

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <Card pad={false} className="relative overflow-hidden">
          <div className="absolute left-3 right-3 top-3 z-10 flex flex-wrap items-center justify-between gap-2">
            <Segmented label="View mode" size="sm" value={mode} onChange={(m) => setMode(m)} options={[
              { value: 'exterior', label: 'Exterior' }, { value: 'cutaway', label: 'Cutaway' }, { value: 'thermal', label: 'Thermal' }, { value: 'phase', label: 'Phase loading' },
            ]} />
            <SourceBadge tag={status} />
          </div>
          <Twin className="h-[380px] w-full sm:h-[460px] lg:h-[580px]" mode={mode} thermalColor={cat.color} thermalLevel={r.tsiDisplay}
            shares={r.phaseShares} selected={part} onSelect={setPart} live={live} showLabels autoRotate={mode === 'exterior'} />
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-10">
            <div className="inline-block max-w-full rounded-md border hair bg-s1/85 px-3 py-2 text-[11.5px] leading-snug text-ink2 backdrop-blur">
              {mode === 'thermal' && <><b className="text-ink">Model-inferred thermal sensitivity</b> — one global colour from the TSI, not a temperature map.</>}
              {mode === 'phase' && <><b className="text-ink">Phase emphasis</b> = measured electrical loading (share of I²), not winding temperature.</>}
              {mode === 'cutaway' && <>Core and three winding columns. Tap a winding, the tank, radiators or bushings for details.</>}
              {mode === 'exterior' && <>Representative 200 kVA oil-immersed distribution transformer. Tap a component for details.</>}
            </div>
          </div>
          <PartDetail part={part} r={r} reading={latest} tag={status} onClose={() => setPart(null)} />
        </Card>

        <Card className="flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] text-ink2">Thermal Sensitivity Index</span>
            <SourceBadge tag={status} />
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1">
            <Value v={r.tsiRaw} digits={3} size="xl" />
            <div className="pb-1">
              <div className="text-[17px] font-semibold" style={{ color: cat.color }}>{cat.label}</div>
              <div className={cx('num text-[12px]', delta > 0 ? 'text-[#EE8B3A]' : 'text-ink3')}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(3)} vs previous</div>
            </div>
          </div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-ink2">Thermal sensitivity is currently <b style={{ color: cat.color }}>{cat.label.toLowerCase()}</b> — <ExplainTsi r={r} />.</p>
          <div className="mt-5"><TsiScale value={r.tsiRaw} /></div>
          <div className="mt-5 grid grid-cols-2 gap-4 hair-t pt-4">
            <Stat label="θ₁hr indicator" v={r.theta} digits={3} hint="dimensionless" />
            <Stat label="Current imbalance" v={r.iimb} unit="%" hint="(Imax − Imin)/Iavg" />
          </div>
          <div className="mt-5">
            <div className="mb-2 text-[12px] text-ink3">Regression terms</div>
            {[
              { k: 'I²eq', v: r.terms.current, c: 'rgb(var(--ember))' },
              { k: 'Iimb', v: r.terms.imbalance, c: 'rgb(var(--sun))' },
              { k: 'Vdev', v: r.terms.voltage, c: 'rgb(var(--steel))' },
            ].map((x) => (
              <div key={x.k} className="mb-1.5 flex items-center gap-2 text-[12px]">
                <span className="w-10 text-ink2">{x.k}</span>
                <div className="relative h-1.5 flex-1 rounded-full bg-s3">
                  <div className="absolute top-0 h-full rounded-full transition-all duration-700" style={{ left: x.v < 0 ? `${50 - (Math.abs(x.v) / termMax) * 50}%` : '50%', width: `${(Math.abs(x.v) / termMax) * 50}%`, background: x.c }} />
                  <div className="absolute left-1/2 top-[-2px] h-[10px] w-px bg-ink3/50" />
                </div>
                <span className="num w-16 text-right text-ink">{x.v >= 0 ? '+' : ''}{x.v.toFixed(4)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-[11px] text-ink3"><span>Last 2 hours</span><span className="num">{fmtTime(receivedAt)}</span></div>
            <Sparkline data={spark} color={cat.color} height={40} domain={[0, 1]} />
          </div>
          <div className="mt-auto pt-4">
            <Disclosure title="How is this calculated?">
              <p>The index comes from three electrical variables: current-squared loading, current imbalance and voltage deviation from 240.0981 V.</p>
              <div className="my-3 rounded-md bg-s2 p-3"><Eq tex={`\\theta_{1hr} = ${THERMAL_MODEL.intercept} + ${THERMAL_MODEL.bIeq2}\\,I_{eq}^2 + ${THERMAL_MODEL.cIimb}\\,I_{imb} + ${THERMAL_MODEL.dVdev}\\,V_{dev}`} /></div>
              <p>TSI = (θ − θmin)/(θmax − θmin) with θmin = −0.86 and θmax = 2.83. Categories are research-defined sensitivity levels, not protection limits.</p>
            </Disclosure>
          </div>
        </Card>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {(['a', 'b', 'c'] as const).map((p) => (
          <button key={p} onClick={() => { setMode('phase'); setPart(`w${p}`) }} className={cx('focus-ring surface rounded-lg p-4 text-left transition-colors hover:bg-s2', part === `w${p}` && 'ring-1 ring-[rgb(var(--line)/0.25)]')}>
            <div className="mb-2 flex items-center gap-2 text-[12px] text-ink2"><PhaseDot p={p} />{PHASE_LABEL[p]}</div>
            <div className="flex items-baseline justify-between gap-2">
              <Value v={latest[`i${p}` as 'ia']} unit="A" size="lg" />
              <Value v={latest[`v${p}` as 'va']} unit="V" size="sm" className="text-ink2" />
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-s3"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${r.phaseShares[p] * 300 / 1.6}%`, background: PHASE_COLOR[p] }} /></div>
          </button>
        ))}
      </div>

      <Card>
        <CardHead title="Trends" sub={range === 'live' ? 'Readings received in this session' : 'Stored by the bridge, averaged per interval'} right={<>
          <Segmented size="sm" label="Chart" value={chart} onChange={setChart} options={[{ value: 'tsi', label: 'TSI' }, { value: 'i', label: 'Currents' }, { value: 'v', label: 'Voltages' }, { value: 'load', label: 'Loading' }]} />
          <Segmented size="sm" label="Range" value={range} onChange={setRange} options={RANGES} />
          {range === 'live' && <SourceBadge tag={status} />}
        </>} />
        {trend.state === 'ok' ? <EChart option={option} height={300} ariaLabel={`${chart} trend chart`} /> : <NoHistory state={trend.state} />}
      </Card>
      <Note>{DISCLAIMER}</Note>
    </div>
  )
}

/* ================= FORMULA FLOW ================= */
function thermalStages(d: { r: PhaseReading; res: ThermalResult }): FlowStage[] {
  const { r, res } = d
  const f = (x: number, k = 1) => x.toFixed(k)
  const cat = categoryMeta(res.category)
  const termMax = Math.max(Math.abs(res.terms.current), Math.abs(res.terms.imbalance), Math.abs(res.terms.voltage), 0.01)
  return [
    { id: 'in', title: 'Meter reading', explain: 'Six RMS values from the IAMMETER meter are the only inputs.',
      items: [
        { label: 'Voltage A · B · C', value: `${f(r.va)} · ${f(r.vb)} · ${f(r.vc)} V` },
        { label: 'Current A · B · C', value: `${f(r.ia)} · ${f(r.ib)} · ${f(r.ic)} A` },
      ] },
    { id: 'feat', title: 'Features', explain: 'Loading is squared because copper loss follows I²R.',
      items: [
        { label: 'Loading', tex: 'I_{eq}^2=\\tfrac{I_a^2+I_b^2+I_c^2}{3}', sub: `=\\tfrac{${f(r.ia)}^2+${f(r.ib)}^2+${f(r.ic)}^2}{3}`, value: `${res.ieq2.toFixed(0)} A²` },
        { label: 'Imbalance', tex: 'I_{imb}=\\tfrac{I_{max}-I_{min}}{I_{avg}}\\times100', sub: `=\\tfrac{${f(Math.max(r.ia, r.ib, r.ic))}-${f(Math.min(r.ia, r.ib, r.ic))}}{${f(res.iavg)}}\\times100`, value: `${f(res.iimb, 2)} %` },
        { label: 'Voltage deviation', tex: 'V_{dev}=V_{avg}-240.10', sub: `=${f(res.vavg, 2)}-240.10`, value: `${f(res.vdev, 2)} V` },
      ] },
    { id: 'reg', title: 'Thermal response', explain: 'Each feature is weighted by its fitted coefficient; loading dominates.',
      items: [
        { label: 'θ₁hr', tex: '\\theta=a+bI_{eq}^2+cI_{imb}+dV_{dev}', sub: `=${res.terms.intercept.toFixed(3)}${sg(res.terms.current)}${sg(res.terms.imbalance)}${sg(res.terms.voltage)}`, value: res.theta.toFixed(3) },
      ],
      extra: (
        <div className="space-y-1.5">
          {[{ k: 'Loading', v: res.terms.current, c: 'rgb(var(--ember))' }, { k: 'Imbalance', v: res.terms.imbalance, c: 'rgb(var(--sun))' }, { k: 'Voltage', v: res.terms.voltage, c: 'rgb(var(--steel))' }].map((x) => (
            <div key={x.k} className="flex items-center gap-2 text-[11.5px]">
              <span className="w-16 text-ink3">{x.k}</span>
              <div className="relative h-1.5 flex-1 rounded-full bg-s3"><div className="absolute top-0 h-full rounded-full transition-all duration-500" style={{ left: x.v < 0 ? `${50 - (Math.abs(x.v) / termMax) * 50}%` : '50%', width: `${(Math.abs(x.v) / termMax) * 50}%`, background: x.c }} /></div>
            </div>
          ))}
        </div>
      ) },
    { id: 'norm', title: 'Normalise', explain: 'θ is scaled over the study range (−0.86 to 2.83) to give 0–1.',
      items: [{ label: 'TSI', tex: 'TSI=\\tfrac{\\theta_{1hr}+0.86}{3.69}', sub: `=\\tfrac{${res.theta.toFixed(3)}+0.86}{3.69}`, value: res.tsiRaw.toFixed(3) }],
      extra: <TsiScale value={res.tsiRaw} compact /> },
    { id: 'cls', title: 'Classify', explain: 'Five research-defined bands; not protection limits.',
      items: [{ label: 'Condition', value: <span style={{ color: cat.color }}>{cat.label}</span> }],
      extra: (
        <div className="grid grid-cols-5 gap-[3px]">
          {TSI_CATEGORIES.map((c) => <div key={c.id} className={cx('rounded-[3px] py-1 text-center text-[9.5px] font-semibold transition-all', res.category === c.id ? 'text-white' : 'text-ink3')} style={{ background: res.category === c.id ? c.color : 'rgb(var(--s2))' }}>{c.label.replace('Very ', 'V. ')}</div>)}
        </div>
      ) },
  ]
}
const sg = (x: number) => `${x >= 0 ? '+' : '-'}${Math.abs(x).toFixed(3)}`

function Formula() {
  const { latest, thermal: res, status } = useLive()
  const t = useChartTheme()
  return (
    <div className="space-y-5">
      <FormulaFlow data={{ r: latest, res }} pulseKey={latest.t} build={thermalStages} tag={status} title="From meter reading to thermal index" />
      <Card>
        <CardHead title="How θ₁hr is built" sub={`a = ${THERMAL_MODEL.intercept} · b = ${THERMAL_MODEL.bIeq2} · c = ${THERMAL_MODEL.cIimb} · d = ${THERMAL_MODEL.dVdev}`} right={<SourceBadge tag={status} />} />
        <EChart option={waterfallOption(t, res)} height={260} ariaLabel="Waterfall of regression terms" />
      </Card>
    </div>
  )
}

/* ================= SIMULATION ================= */
const PRESETS: { k: string; label: string; r: PhaseReading }[] = [
  { k: 'night', label: 'Night base load', r: { va: 246, vb: 245, vc: 246, ia: 85, ib: 92, ic: 80 } },
  { k: 'balanced', label: 'Balanced midday', r: { va: 232, vb: 232, vc: 232, ia: 230, ib: 230, ic: 230 } },
  { k: 'unbalanced', label: 'Unbalanced midday', r: { va: 231, vb: 229, vc: 232, ia: 200, ib: 280, ic: 190 } },
  { k: 'peak', label: 'Winter peak', r: { va: 228, vb: 226, vc: 229, ia: 260, ib: 300, ic: 245 } },
]

function Simulation() {
  const { latest, thermal: live } = useLive()
  const t = useChartTheme()
  const [sandbox, setSandbox] = useState<PhaseReading | null>(PRESETS[0].r)
  const input = sandbox ?? latest
  const r = useMemo(() => computeThermal(input), [input])
  const cat = categoryMeta(r.category)
  const set = (k: keyof PhaseReading) => (v: number) => setSandbox({ ...(sandbox ?? { va: latest.va, vb: latest.vb, vc: latest.vc, ia: latest.ia, ib: latest.ib, ic: latest.ic }), [k]: v })
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-medium text-ink2">Start from</span>
        <button disabled={!latest.t} onClick={() => setSandbox(null)} className={cx('focus-ring rounded-sm border px-3 py-1.5 text-[12.5px] font-medium', !sandbox ? 'border-navy bg-navy text-onnavy' : 'hair bg-s1 hover:bg-s2')}>Latest reading</button>
        {PRESETS.map((p) => <button key={p.k} onClick={() => setSandbox(p.r)} className="focus-ring rounded-sm border hair bg-s1 px-3 py-1.5 text-[12.5px] font-medium hover:bg-s2">{p.label}</button>)}
        <SourceBadge tag="SIMULATED" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHead title="Phase inputs" sub="Move a slider and the index updates instantly" />
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {(['ia', 'ib', 'ic'] as const).map((k, i) => <Slider key={k} label={`${PHASE_LABEL[(['a', 'b', 'c'] as const)[i]]} current`} unit=" A" min={0} max={350} step={1} digits={0} value={input[k]} onChange={set(k)} />)}
            {(['va', 'vb', 'vc'] as const).map((k, i) => <Slider key={k} label={`${PHASE_LABEL[(['a', 'b', 'c'] as const)[i]]} voltage`} unit=" V" min={210} max={260} step={0.5} value={input[k]} onChange={set(k)} />)}
          </div>
        </Card>
        <Card>
          <div className="flex flex-wrap items-baseline gap-3"><Value v={r.tsiRaw} digits={3} size="xl" /><span className="text-[17px] font-semibold" style={{ color: cat.color }}>{cat.label}</span></div>
          <div className="mt-4"><TsiScale value={r.tsiRaw} /></div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="I²eq" v={r.ieq2} unit="A²" digits={0} size="sm" />
            <Stat label="Iimb" v={r.iimb} unit="%" size="sm" />
            <Stat label="Vdev" v={r.vdev} unit="V" size="sm" />
            <Stat label="θ₁hr" v={r.theta} digits={3} size="sm" />
          </div>
          <p className="mt-3 text-[12.5px] text-ink3">Live index for comparison: <b className="num text-ink">{latest.t&&Number.isFinite(live.tsiRaw)?live.tsiRaw.toFixed(3):'Unavailable'}</b></p>
          <EChart option={waterfallOption(t, r)} height={210} ariaLabel="Waterfall for simulated inputs" />
        </Card>
      </div>
    </div>
  )
}

/* ================= HISTORY (stored by the bridge) ================= */
function History() {
  const t = useChartTheme()
  const [range, setRange] = useState<HistRange>('24h')
  const h = useStoredHistory(MAIN_SN, range)
  const results = useMemo(() => h.rows.map((x) => ({ t: x.t, r: computeThermal(x), x })), [h.rows])
  const pb = usePlayback(Math.max(1, results.length))
  const cur = results[Math.min(pb.index, results.length - 1)]
  const summary = useMemo(() => {
    if (!results.length) return null
    const v = results.map((x) => x.r.tsiRaw)
    const peak = results.reduce((m, x) => (x.r.tsiRaw > m.r.tsiRaw ? x : m), results[0])
    const high = results.filter((x) => ['high', 'veryhigh', 'critical', 'above'].includes(x.r.category)).length
    return { mean: v.reduce((a, b) => a + b, 0) / v.length, peak, highShare: (high / results.length) * 100, load: results.reduce((a, x) => a + apparentPowerKva(x.x), 0) / results.length / 2 }
  }, [results])
  const tsiOpt = useMemo(() => {
    const o = tsiOption(t, results.map((x) => ({ t: x.t, r: x.r })))
    if (!cur) return o
    const s0 = (o.series as object[])[0]
    return { ...o, series: [{ ...s0, markLine: { silent: true, symbol: 'none', animation: false, lineStyle: { color: t.pc, width: 1.5 }, label: { show: false }, data: [{ xAxis: cur.t }] } }] }
  }, [t, results, cur])
  const curOpt = useMemo(() => phaseOption(t, h.rows, 'i', null), [t, h.rows])
  const [copied, setCopied] = useState(false)
  const exportCsv = () => {
    const head = 'timestamp,va,vb,vc,ia,ib,ic,ieq2,iimb,vdev,theta_1hr,tsi,category\n'
    const body = results.map(({ t: ts, r, x }) => [new Date(ts).toISOString(), x.va, x.vb, x.vc, x.ia, x.ib, x.ic, r.ieq2.toFixed(1), r.iimb.toFixed(3), r.vdev.toFixed(3), r.theta.toFixed(5), r.tsiRaw.toFixed(5), r.category].join(',')).join('\n')
    const csv = head + body
    try { const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const el = document.createElement('a'); el.href = url; el.download = `thermal-history-${range}.csv`; el.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) } catch { /* downloads blocked */ }
    navigator.clipboard?.writeText(csv).then(() => setCopied(true), () => setCopied(false))
  }
  const cat = cur ? categoryMeta(cur.r.category) : null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Range" value={range} onChange={setRange} options={[{ value: '24h', label: '24 hours' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }]} />
        {h.coverage?.first && <span className="text-[12.5px] text-ink3">Recorded since {new Date(h.coverage.first).toLocaleDateString()} · {h.coverage.days} day{h.coverage.days === 1 ? '' : 's'} stored</span>}
      </div>
      {h.state !== 'ok' || !summary || !cur || !cat ? <Card><NoHistory state={h.state} /></Card> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="!p-4"><Stat label="Average TSI" v={summary.mean} digits={3} /></Card>
            <Card className="!p-4"><Stat label="Peak TSI" v={summary.peak.r.tsiRaw} digits={3} hint={fmtTime(summary.peak.t, true)} /></Card>
            <Card className="!p-4"><Stat label="Time at High or above" v={summary.highShare} unit="%" digits={0} /></Card>
            <Card className="!p-4"><Stat label="Average loading" v={summary.load} unit="% of 200 kVA" digits={0} /></Card>
          </div>
          <PlaybackBar pb={pb} times={results.map((x) => x.t)} label="Replay stored readings" />
          <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
            <Card pad={false} className="relative overflow-hidden">
              <Twin className="h-[340px] w-full lg:h-[420px]" mode="thermal" thermalColor={cat.color} thermalLevel={cur.r.tsiDisplay} shares={cur.r.phaseShares} live={pb.playing} showLabels />
            </Card>
            <Card>
              <div className="num text-[12px] text-ink3">{fmtTime(cur.t, true)}</div>
              <div className="mt-2 flex items-baseline gap-3"><Value v={cur.r.tsiRaw} digits={3} size="lg" /><span className="font-semibold" style={{ color: cat.color }}>{cat.label}</span></div>
              <div className="mt-4"><TsiScale value={cur.r.tsiRaw} compact /></div>
              <KV rows={[
                ['Currents A · B · C', `${cur.x.ia.toFixed(0)} · ${cur.x.ib.toFixed(0)} · ${cur.x.ic.toFixed(0)} A`],
                ['Loading I²eq', `${cur.r.ieq2.toFixed(0)} A²`], ['Imbalance', `${cur.r.iimb.toFixed(2)} %`], ['Voltage deviation', `${cur.r.vdev.toFixed(2)} V`], ['θ₁hr', cur.r.theta.toFixed(4)],
              ]} />
            </Card>
          </div>
          <Card>
            <CardHead title="Thermal Sensitivity Index" sub="Shaded bands are the five condition levels" right={
              <button onClick={exportCsv} className="focus-ring inline-flex items-center gap-1.5 rounded-md border hair bg-s2 px-3 py-1.5 text-[12px] font-medium hover:bg-s3"><IconDownload width={14} height={14} />{copied ? 'CSV copied' : 'Export CSV'}</button>
            } />
            <EChart option={tsiOpt} height={280} ariaLabel="Stored TSI trend" />
          </Card>
          <Card>
            <CardHead title="Phase currents" />
            <EChart option={curOpt} height={240} ariaLabel="Stored phase currents" />
          </Card>
        </>
      )}
    </div>
  )
}

export default function ThermalPage({ section }: { section: string }) {
  const d=useLive()
  if(!d.latest.t && ['overview','model'].includes(section)) return <ConnectionState/>
  switch (section) {
    case 'model': return <Formula />
    case 'simulation': return <Simulation />
    case 'history': return <History />
    case 'dataflow': return <DataPath sn={MAIN_SN} />
    default: return <Overview />
  }
}
