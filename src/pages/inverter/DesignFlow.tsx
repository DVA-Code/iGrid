import { useMemo, useState } from 'react'
import { FormulaFlow, type FlowStage } from '@/components/FormulaFlow'
import { Icon, type IconName } from '@/components/ui/symbols'
import { Card, CardHead, Slider } from '@/components/ui/ui'
import { filterPeriod, INVERTER_REPORTED, lcResponse, periodBridgeWave, PROTOTYPE_PRESET, rmsSpectrum, thdFromSpectrum } from '@/lib/models/inverter'

/** Design inputs — defaults follow the lab prototype (12 V battery, Arduino SPWM at 16 MHz, 250 µH / 1 µF filter). */
export interface DesignInput {
  pOut: number; vOut: number; fOut: number; vdc: number; eta: number; hours: number; dod: number
  m: number; fClk: number; top: number; deadC: number; f0: number; cUf: number
}
export const DEFAULT_DESIGN: DesignInput = {
  pOut: 100, vOut: 230, fOut: 50, vdc: 12, eta: 0.85, hours: 2, dod: 0.5,
  m: +(PROTOTYPE_PRESET.m).toFixed(2), fClk: 16e6, top: 255, deadC: 40, f0: 10_000, cUf: 1,
}

export interface DesignResult {
  idc: number; ah: number; fc: number; nTable: number; mf: number; td: number
  v1pk: number; v1rms: number; L: number; f0: number; att2fc: number; g50: number
  n: number; iPri: number; vds: number; pCond: number; pSw: number; vout: number; iOut: number; thd: number; thdBridge: number
}

export function computeDesign(d: DesignInput): DesignResult {
  const idc = d.pOut / (d.eta * d.vdc)
  const ah = (idc * d.hours) / d.dod
  const fc = d.fClk / (2 * d.top)
  const nTable = Math.round(fc / d.fOut)
  const mf = fc / d.fOut
  const td = (d.deadC / d.fClk) * 1e6
  const v1pk = d.m * d.vdc
  const v1rms = v1pk / Math.SQRT2
  const C = d.cUf * 1e-6
  const L = 1 / ((2 * Math.PI * d.f0) ** 2 * C)
  const att2fc = -20 * Math.log10(lcResponse(2 * fc, L, C, Infinity, 0.5).mag)
  const g50 = lcResponse(d.fOut, L, C, Infinity, 0.5).mag
  const n = d.vOut / (v1rms * g50)
  const iPri = d.pOut / (d.eta * v1rms)
  const vds = 2 * d.vdc
  const pCond = 2 * iPri ** 2 * INVERTER_REPORTED.mosfet.rdsOn
  const pSw = 2 * 0.5 * d.vdc * iPri * Math.SQRT2 * (INVERTER_REPORTED.mosfet.trNs + INVERTER_REPORTED.mosfet.tfNs) * 1e-9 * fc
  const vout = n * v1rms * g50
  const iOut = d.pOut / vout
  const p = { fRef: d.fOut, fCarrier: fc, m: d.m, deadTimeUs: td, vdc: d.vdc }
  const bridge = periodBridgeWave(p, 14)
  const filt = filterPeriod(bridge, d.fOut, L, C, Infinity, 0.5)
  return { idc, ah, fc, nTable, mf, td, v1pk, v1rms, L, f0: d.f0, att2fc, g50, n, iPri, vds, pCond, pSw, vout, iOut, thd: thdFromSpectrum(rmsSpectrum(filt), 1500), thdBridge: thdFromSpectrum(rmsSpectrum(bridge), 1500) }
}

const k = (x: number, d = 1) => x.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d })

function stages({ d, r }: { d: DesignInput; r: DesignResult }): FlowStage[] {
  return [
    { id: 'spec', title: 'Specification', explain: 'What the inverter must deliver, and from what source.',
      items: [
        { label: 'Output power', value: `${d.pOut} W` },
        { label: 'Output voltage / frequency', value: `${d.vOut} V · ${d.fOut} Hz` },
        { label: 'Battery voltage', value: `${d.vdc} V DC` },
      ] },
    { id: 'battery', title: 'Battery and charge controller', explain: 'DC current sets the battery size. State of charge is tracked by counting charge in and out; the controller disconnects the load below 50 % and the charger above 90 %.',
      items: [
        { label: 'Battery current', tex: 'I_{dc}=\\frac{P_{out}}{\\eta\\,V_{dc}}', sub: `=\\frac{${d.pOut}}{${d.eta}\\times${d.vdc}}`, value: `${k(r.idc)} A` },
        { label: 'Capacity for backup time', tex: 'C_{Ah}=\\frac{I_{dc}\\,t}{DoD}', sub: `=\\frac{${k(r.idc)}\\times${d.hours}}{${d.dod}}`, value: `${k(r.ah, 0)} Ah` },
        { label: 'State of charge (coulomb counting)', tex: 'SOC_k=SOC_{k-1}+\\frac{I\\,\\Delta t}{3600\\,C_{Ah}}', value: '50–90 % window' },
      ] },
    { id: 'clock', title: 'Switching frequency', explain: 'The Arduino timer in phase-correct mode sets the carrier. One sine table entry is used per carrier period, so the table length fixes the output frequency.',
      items: [
        { label: 'Carrier frequency', tex: 'f_c=\\frac{f_{clk}}{2\\,TOP}', sub: `=\\frac{${d.fClk / 1e6}\\,\\text{MHz}}{2\\times${d.top}}`, value: `${k(r.fc / 1000, 2)} kHz` },
        { label: 'Sine table length', tex: 'N=\\frac{f_c}{f_{out}}', sub: `=\\frac{${k(r.fc, 0)}}{${d.fOut}}`, value: `${r.nTable} entries` },
        { label: 'Dead time', tex: 't_d=\\frac{C_{dt}}{f_{clk}}', sub: `=\\frac{${d.deadC}}{${d.fClk / 1e6}\\times10^6}`, value: `${k(r.td, 2)} µs` },
      ] },
    { id: 'bridge', title: 'SPWM H-bridge output', explain: 'With sinusoidal PWM the fundamental of the bridge voltage is proportional to the modulation index m (linear for m ≤ 1).',
      items: [
        { label: 'Fundamental peak', tex: '\\hat V_1=m\\,V_{dc}', sub: `=${d.m}\\times${d.vdc}`, value: `${k(r.v1pk, 2)} V` },
        { label: 'Fundamental RMS', tex: 'V_{1}=\\frac{m\\,V_{dc}}{\\sqrt2}', value: `${k(r.v1rms, 2)} V` },
        { label: 'Frequency ratio', tex: 'm_f=\\frac{f_c}{f_{out}}', value: k(r.mf, 0) },
      ] },
    { id: 'filter', title: 'LC low-pass filter', explain: 'Place the corner well above 50 Hz and well below the first switching harmonics near 2f_c. Choose C, then L follows.',
      items: [
        { label: 'Inductance for chosen f₀ and C', tex: 'L=\\frac{1}{(2\\pi f_0)^2C}', sub: `=\\frac{1}{(2\\pi\\times${k(d.f0, 0)})^2\\times${d.cUf}\\,\\mu F}`, value: `${k(r.L * 1e6, 0)} µH` },
        { label: 'Attenuation at 2f_c', tex: 'A=-20\\log_{10}|H(2f_c)|', value: `${k(r.att2fc, 1)} dB` },
        { label: 'Gain at 50 Hz', tex: '|H(f)|\\approx\\frac{1}{1-(f/f_0)^2}', value: k(r.g50, 4) },
      ] },
    { id: 'xfmr', title: 'Step-up transformer', explain: 'The filtered low-voltage sine is raised to mains voltage. Primary current is high, so switch losses are checked here.',
      items: [
        { label: 'Turns ratio', tex: 'n=\\frac{V_{out}}{V_1}', sub: `=\\frac{${d.vOut}}{${k(r.v1rms * r.g50, 2)}}`, value: `1 : ${k(r.n, 1)}` },
        { label: 'Primary current', tex: 'I_{p}=\\frac{P_{out}}{\\eta\\,V_1}', value: `${k(r.iPri)} A` },
        { label: 'Switch losses (2 conducting)', tex: 'P=2I_p^2R_{ds}+V_{dc}I_{pk}(t_r+t_f)f_c', value: `${k(r.pCond + r.pSw, 2)} W` },
      ] },
    { id: 'out', title: 'Output check', explain: 'Final values for the chosen design. THD comes from an FFT of one simulated output period.',
      items: [
        { label: 'Output voltage', tex: 'V_{out}=n\\,V_1\\,|H(f)|', value: `${k(r.vout, 0)} V` },
        { label: 'Load current', tex: 'I_{out}=\\frac{P_{out}}{V_{out}}', value: `${k(r.iOut, 2)} A` },
        { label: 'THD after filter (to 75 kHz)', tex: 'THD=\\frac{\\sqrt{\\sum_{h\\ge2}V_h^2}}{V_1}', value: `${k(r.thd, 2)} %` },
      ] },
  ]
}

const CHAIN: { icon: IconName; label: string }[] = [
  { icon: 'battery_charging_full', label: 'Battery + controller' },
  { icon: 'memory', label: 'SPWM (Arduino)' },
  { icon: 'electrical_services', label: 'H-bridge' },
  { icon: 'waves', label: 'LC filter' },
  { icon: 'power', label: 'Transformer' },
  { icon: 'home', label: 'Load 230 V' },
]

export default function DesignFlow() {
  const [d, setD] = useState<DesignInput>(DEFAULT_DESIGN)
  const r = useMemo(() => computeDesign(d), [d])
  const set = <K extends keyof DesignInput>(key: K) => (v: number) => setD((x) => ({ ...x, [key]: v }))
  return (
    <div className="space-y-5">
      <Card>
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
          {CHAIN.map((c, i) => (
            <div key={c.label} className="flex shrink-0 items-center gap-2">
              <div className="flex items-center gap-2 rounded-md border hair bg-s2/60 px-3 py-2">
                <Icon name={c.icon} size={18} className="text-navy" />
                <span className="whitespace-nowrap text-[12.5px] font-medium">{c.label}</span>
              </div>
              {i < CHAIN.length - 1 && <Icon name="arrow_forward" size={16} className="text-ink3" />}
            </div>
          ))}
        </div>
      </Card>
      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="h-fit xl:sticky xl:top-[124px]">
          <CardHead title="Design inputs" sub="Change any value; every step recalculates" />
          <div className="space-y-4">
            <Slider label="Output power" unit=" W" min={20} max={500} step={10} digits={0} value={d.pOut} onChange={set('pOut')} />
            <Slider label="Output voltage" unit=" V" min={110} max={240} step={5} digits={0} value={d.vOut} onChange={set('vOut')} />
            <Slider label="Battery voltage" unit=" V" min={12} max={48} step={12} digits={0} value={d.vdc} onChange={set('vdc')} />
            <Slider label="Efficiency" min={0.6} max={0.95} step={0.01} digits={2} value={d.eta} onChange={set('eta')} />
            <Slider label="Backup time" unit=" h" min={0.5} max={8} step={0.5} digits={1} value={d.hours} onChange={set('hours')} />
            <Slider label="Modulation index m" min={0.3} max={1} step={0.01} digits={2} value={d.m} onChange={set('m')} />
            <Slider label="Filter corner f₀" unit=" Hz" min={1000} max={20000} step={500} digits={0} value={d.f0} onChange={set('f0')} />
            <Slider label="Filter capacitor C" unit=" µF" min={0.5} max={10} step={0.5} digits={1} value={d.cUf} onChange={set('cUf')} />
            <button onClick={() => setD(DEFAULT_DESIGN)} className="focus-ring w-full rounded-sm border hair px-3 py-2 text-[12.5px] font-medium hover:bg-s2">Reset to lab prototype</button>
          </div>
        </Card>
        <FormulaFlow data={{ d, r }} pulseKey={JSON.stringify(d)} build={stages} tag="CALCULATED" title="Design steps" vertical instant hint="Animates when an input changes" />
      </div>
    </div>
  )
}
