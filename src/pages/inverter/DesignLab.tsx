import { useMemo, useState } from 'react'
import { baseOption, EChart, type EOption, useChartTheme } from '@/components/charts/EChart'
import { Card, CardHead, Segmented, Slider, SourceBadge, Stat } from '@/components/ui/ui'
import { filterPeriod, lcCutoff, lcResponse, periodBridgeWave, PROTOTYPE_PRESET, rms, rmsSpectrum, simulateSpwm, thdFromSpectrum } from '@/lib/models/inverter'

const fmtHz = (v: number) => (v >= 1000 ? `${v / 1000}k` : `${v}`)

/** One simulation that covers the whole design: switching, filtering, spectrum and filter response. */
export default function DesignLab() {
  const t = useChartTheme()
  const [m, setM] = useState(0.92)
  const [vdc, setVdc] = useState(12)
  const [Lu, setLu] = useState(250)
  const [Cu, setCu] = useState(1)
  const [dead, setDead] = useState(2.5)
  const [load, setLoad] = useState<'open' | '1k' | '100'>('1k')
  const R = load === 'open' ? Infinity : load === '1k' ? 1000 : 100
  const L = Lu * 1e-6, C = Cu * 1e-6
  const fc = PROTOTYPE_PRESET.fCarrier
  const f0 = lcCutoff(L, C)

  const p = useMemo(() => ({ ...PROTOTYPE_PRESET, m, vdc, deadTimeUs: dead }), [m, vdc, dead])
  const bridge = useMemo(() => periodBridgeWave(p, 15), [p])
  const filtered = useMemo(() => filterPeriod(bridge, p.fRef, L, C, R, 0.5), [bridge, p.fRef, L, C, R])
  const specB = useMemo(() => rmsSpectrum(bridge), [bridge])
  const specF = useMemo(() => rmsSpectrum(filtered), [filtered])
  const thdB = thdFromSpectrum(specB, 1500), thdF = thdFromSpectrum(specF, 1500)
  const att = -20 * Math.log10(lcResponse(2 * fc, L, C, R, 0.5).mag)

  /* principle view: same SPWM rule with a slowed carrier (21 × 50 Hz) so the pulses are visible */
  const principle = useMemo(() => simulateSpwm({ ...p, fCarrier: 21 * 50, deadTimeUs: 0 }, 0, 0.02, 2400), [p])
  const principleOpt = useMemo<EOption>(() => {
    const b = baseOption(t)
    const x = principle.map((s) => +(s.t * 1000).toFixed(3))
    return {
      ...b, animation: false,
      legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 3, textStyle: { color: t.ink2, fontSize: 11 } },
      tooltip: { ...(b.tooltip as object), trigger: 'axis' },
      grid: [{ left: 44, right: 12, top: 28, height: '38%' }, { left: 44, right: 12, top: '60%', height: '30%' }],
      xAxis: [0, 1].map((i) => ({ ...(b.xAxis as object), gridIndex: i, type: 'category', data: x, boundaryGap: false, axisLabel: { show: i === 1, color: t.ink3, fontSize: 10, interval: 399 }, name: i === 1 ? 'ms' : '' })),
      yAxis: [
        { ...(b.yAxis as object), gridIndex: 0, type: 'value', min: -1.2, max: 1.2, name: 'compare' },
        { ...(b.yAxis as object), gridIndex: 1, type: 'value', min: -1.3 * vdc, max: 1.3 * vdc, name: 'V' },
      ],
      series: [
        { type: 'line', name: 'Sine reference (m)', xAxisIndex: 0, yAxisIndex: 0, data: principle.map((s) => +s.ref.toFixed(3)), showSymbol: false, lineStyle: { width: 2, color: t.sun }, itemStyle: { color: t.sun } },
        { type: 'line', name: 'Triangle carrier', xAxisIndex: 0, yAxisIndex: 0, data: principle.map((s) => +s.carrier.toFixed(3)), showSymbol: false, lineStyle: { width: 1, color: t.ink3 }, itemStyle: { color: t.ink3 } },
        { type: 'line', name: 'Bridge output', xAxisIndex: 1, yAxisIndex: 1, data: principle.map((s) => s.vab), step: 'end', showSymbol: false, lineStyle: { width: 1.4, color: t.teal }, itemStyle: { color: t.teal } },
      ],
    }
  }, [t, principle, vdc])

  const timeOpt = useMemo<EOption>(() => {
    const b = baseOption(t)
    const n = bridge.length, stride = 4
    const x: number[] = [], yb: number[] = [], yf: number[] = []
    for (let i = 0; i < n; i += stride) { x.push(+((i / n) * 20).toFixed(3)); yb.push(bridge[i]); yf.push(+filtered[i].toFixed(3)) }
    return {
      ...b, animation: false,
      legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 3, textStyle: { color: t.ink2, fontSize: 11 } },
      tooltip: { ...(b.tooltip as object), valueFormatter: (v: number) => `${v.toFixed(2)} V` },
      xAxis: { ...(b.xAxis as object), type: 'category', data: x, boundaryGap: false, name: 'ms', axisLabel: { color: t.ink3, fontSize: 10, interval: Math.floor(x.length / 8) } },
      yAxis: { ...(b.yAxis as object), type: 'value', name: 'V' },
      series: [
        { type: 'line', name: 'Before filter', data: yb, step: 'end', showSymbol: false, lineStyle: { width: 0.7, color: t.alpha('--sun', 0.45) }, itemStyle: { color: t.sun } },
        { type: 'line', name: 'After LC filter', data: yf, showSymbol: false, lineStyle: { width: 2.2, color: t.teal }, itemStyle: { color: t.teal } },
      ],
    }
  }, [t, bridge, filtered])

  const specOpt = useMemo<EOption>(() => {
    const b = baseOption(t)
    const toPts = (s: Float64Array) => {
      const out: [number, number][] = []
      for (let k = 1; k < Math.min(s.length, 1800); k++) {
        const db = 20 * Math.log10(Math.max(s[k], 1e-12) / s[1])
        if (db > -80 || k === 1) out.push([k * p.fRef, +db.toFixed(2)])
      }
      return out
    }
    return {
      ...b, animation: false,
      legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 6, textStyle: { color: t.ink2, fontSize: 11 } },
      tooltip: { ...(b.tooltip as object), trigger: 'item', formatter: (q: { seriesName: string; value: [number, number] }) => `${q.seriesName}<br/><b>${q.value[0].toLocaleString()} Hz</b> · ${q.value[1].toFixed(1)} dBc` },
      xAxis: { ...(b.xAxis as object), type: 'log', name: 'Hz', min: 40, max: 90000, axisLabel: { color: t.ink3, fontSize: 10, formatter: fmtHz }, splitLine: { show: true, lineStyle: { color: t.line } } },
      yAxis: { ...(b.yAxis as object), type: 'value', name: 'dBc', min: -80, max: 5 },
      series: [
        { type: 'bar', name: 'Before filter', data: toPts(specB), barWidth: 1.5, itemStyle: { color: t.alpha('--sun', 0.65) }, large: true },
        { type: 'bar', name: 'After filter', data: toPts(specF), barWidth: 1.5, itemStyle: { color: t.teal }, large: true },
      ],
    }
  }, [t, specB, specF, p.fRef])

  const bodeOpt = useMemo<EOption>(() => {
    const b = baseOption(t)
    const pts: [number, number][] = []
    for (let e = 1; e <= 5.3; e += 0.01) { const f = 10 ** e; pts.push([f, +(20 * Math.log10(lcResponse(f, L, C, R, 0.5).mag)).toFixed(2)]) }
    return {
      ...b,
      tooltip: { ...(b.tooltip as object), trigger: 'axis', valueFormatter: (v: number) => `${v.toFixed(1)} dB` },
      xAxis: { ...(b.xAxis as object), type: 'log', name: 'Hz', min: 10, max: 200000, axisLabel: { color: t.ink3, fontSize: 10, formatter: fmtHz }, splitLine: { show: true, lineStyle: { color: t.line } } },
      yAxis: { ...(b.yAxis as object), type: 'value', name: '|H| dB', min: -80, max: 40 },
      series: [{
        type: 'line', name: '|H(f)|', data: pts, showSymbol: false, lineStyle: { width: 2, color: t.teal },
        markLine: { silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: t.ink3 }, label: { color: t.ink2, fontSize: 10, formatter: (q: { name: string }) => q.name }, data: [
          { name: '50 Hz', xAxis: 50 }, { name: `f₀ ${(f0 / 1000).toFixed(1)} kHz`, xAxis: f0 }, { name: `2f_c ${(2 * fc / 1000).toFixed(0)} kHz`, xAxis: 2 * fc },
        ] },
      }],
    }
  }, [t, L, C, R, f0, fc])

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHead title="Design values" right={<SourceBadge tag="SIMULATED" />} />
          <div className="space-y-4">
            <Slider label="Modulation index m" min={0.2} max={1} step={0.01} digits={2} value={m} onChange={setM} />
            <Slider label="Battery voltage" unit=" V" min={12} max={48} step={12} digits={0} value={vdc} onChange={setVdc} />
            <Slider label="Filter inductance L" unit=" µH" min={50} max={2000} step={10} digits={0} value={Lu} onChange={setLu} />
            <Slider label="Filter capacitance C" unit=" µF" min={0.1} max={10} step={0.1} digits={1} value={Cu} onChange={setCu} />
            <Slider label="Dead time" unit=" µs" min={0} max={20} step={0.5} value={dead} onChange={setDead} />
            <div>
              <div className="mb-1.5 text-[12px] text-ink2">Load on the filter</div>
              <Segmented size="sm" label="Load" value={load} onChange={setLoad} options={[{ value: 'open', label: 'None' }, { value: '1k', label: '1 kΩ' }, { value: '100', label: '100 Ω' }]} />
            </div>
          </div>
        </Card>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
            <Card className="!p-4"><Stat label="Bridge fundamental" v={(m * vdc) / Math.SQRT2} unit="V rms" digits={2} /></Card>
            <Card className="!p-4"><Stat label="Filter output" v={rms(filtered)} unit="V rms" digits={2} /></Card>
            <Card className="!p-4"><Stat label="Corner f₀" v={f0 / 1000} unit="kHz" digits={2} /></Card>
            <Card className="!p-4"><Stat label="Attenuation at 2f_c" v={att} unit="dB" digits={0} /></Card>
            <Card className="!p-4"><Stat label="THD before filter (to 75 kHz)" v={thdB} unit="%" digits={1} /></Card>
            <Card className="!p-4"><Stat label="THD after filter (to 75 kHz)" v={thdF} unit="%" digits={2} /></Card>
          </div>
          <Card>
            <CardHead title="1 · How SPWM makes the pulses" sub="Bridge switches when the sine crosses the triangle. Carrier slowed to 1.05 kHz here so the pulses are visible; the design uses 31.4 kHz." />
            <EChart option={principleOpt} height={300} ariaLabel="SPWM comparison and bridge pulses" />
          </Card>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHead title="2 · One cycle before and after the LC filter" sub="Carrier 31.4 kHz" />
          <EChart option={timeOpt} height={280} ariaLabel="Bridge and filtered output over one cycle" />
        </Card>
        <Card>
          <CardHead title="3 · Spectrum" sub="Harmonics relative to the 50 Hz fundamental" />
          <EChart option={specOpt} height={280} ariaLabel="Spectrum before and after filtering" />
        </Card>
      </div>
      <Card>
        <CardHead title="4 · Filter response" sub="Keep 50 Hz in the flat region and switching harmonics (near 2f_c) far down the slope" />
        <EChart option={bodeOpt} height={260} ariaLabel="LC filter frequency response" />
      </Card>
    </div>
  )
}
