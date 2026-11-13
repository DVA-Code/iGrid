/**
 * KU campus LV distribution network — bus and line geometry taken from the lab's existing
 * load-flow map (gmlab.ku.edu.np/gml_grid.html). Lines are named Line<i>_<j> with i upstream.
 * Study values (P, loading %) are from that load-flow snapshot and are tagged as STUDY, not live.
 */
import type { MeterReading } from './models/energy'


export interface Bus { id: number; name: string; lat: number; lon: number }
export interface Line { id: string; from: number; to: number; studyKw: number; studyLoading: number }

export const BUSES: Bus[] = [
  [0, 'Transformer Primary (HV)', 27.61964, 85.536], [1, 'Transformer Secondary (LV)', 27.61964, 85.5367], [2, 'LVB2', 27.61967, 85.53733],
  [3, 'Multipurpose Hall', 27.61948, 85.53724], [4, 'LVB4', 27.619528, 85.537918], [5, 'Block 10', 27.6198, 85.53804], [6, 'Civil Engineering', 27.61941, 85.53802],
  [7, 'LVB7', 27.61953, 85.5383], [8, 'Administration', 27.61955, 85.5385], [9, 'LVB9', 27.6191, 85.53842], [10, 'Library', 27.61897, 85.53857],
  [11, 'LVB11', 27.619102, 85.538719], [12, 'LVB12', 27.61916, 85.5388], [13, 'CV Raman Auditorium', 27.61934, 85.53885], [14, 'LVB14', 27.61884, 85.53873],
  [15, 'LVB15', 27.61869, 85.53938], [16, 'UMN Science Block', 27.61891, 85.53925], [17, 'AEC Block', 27.61859, 85.53959], [18, 'LVB18', 27.61946, 85.53967],
  [19, 'Biotechnology Block', 27.61943, 85.53953], [20, 'LVB20', 27.61867, 85.53896], [21, 'LVB21', 27.61834, 85.53885], [22, 'Girls Hostel', 27.61812, 85.53921],
  [23, 'Staff Quarter', 27.61769, 85.53912], [24, 'LVB24', 27.61979, 85.5371], [25, 'Mechanical Workshop', 27.61983, 85.5372], [26, 'LVB26', 27.61978, 85.53751],
  [27, 'TTC 1', 27.61988, 85.53743], [28, 'TTC 2', 27.62006, 85.53776], [29, 'LVB29', 27.62046, 85.53813], [30, 'NIMB ATM', 27.62061, 85.53827],
  [31, 'LVB31', 27.61916, 85.53784], [32, 'Biotechnology Block (2)', 27.6188, 85.53804], [33, 'LVB33', 27.61848, 85.53786], [34, 'Fast Food Café', 27.61849, 85.53833],
  [35, 'LVB35', 27.61786, 85.53768], [36, 'KU Mesh', 27.61805, 85.53786], [37, 'LVB37', 27.61771, 85.53714], [38, 'KU Boys Hostel', 27.61776, 85.53674],
  [40, 'KU Girls Hostel 2', 27.61751, 85.53745], [41, 'KU Boys Hostel 2', 27.61745, 85.5372], [42, 'LVB42', 27.61785, 85.53823], [43, 'Staff Quarter 2', 27.6177, 85.53833],
  [44, 'LVB44', 27.61752, 85.53911], [45, 'NIMB', 27.61749, 85.53897], [46, 'LVB46', 27.619633, 85.538277], [47, 'LVB47', 27.61966, 85.53875],
  [48, 'LVB48', 27.61988, 85.53927], [49, 'Electrical Engineering Block', 27.61981, 85.53934], [50, 'Block 9', 27.61999, 85.53902], [51, 'TTL', 27.61991, 85.53953],
  [52, 'SOM Lab', 27.61986, 85.53779],
].map(([id, name, lat, lon]) => ({ id: id as number, name: name as string, lat: lat as number, lon: lon as number }))

const L = (from: number, to: number, kw: number, loading: number): Line => ({ id: from === 0 ? 'Transformer' : `Line${from}_${to}`, from, to, studyKw: kw, studyLoading: loading })
export const LINES: Line[] = [
  L(0, 1, 0, 0),
  L(1, 2, 94.806, 47.732), L(2, 3, 2.157, 1.092), L(2, 4, 92.452, 46.526), L(4, 5, 4.314, 2.185), L(4, 6, 2.157, 1.092), L(4, 7, 45.206, 22.904),
  L(7, 8, 4.314, 2.185), L(7, 9, 25.938, 13.141), L(9, 10, 2.157, 1.092), L(9, 11, 23.763, 12.038), L(11, 12, 23.752, 12.031), L(12, 13, 5.392, 2.731),
  L(12, 14, 18.355, 9.298), L(14, 15, 5.395, 2.732), L(15, 16, 2.157, 1.092), L(15, 17, 1.08, 0.547), L(15, 18, 2.157, 1.093), L(18, 19, 2.157, 1.092),
  L(14, 20, 12.954, 6.562), L(20, 21, 12.951, 6.56), L(21, 22, 8.63, 4.371), L(21, 23, 4.315, 2.185), L(1, 24, 18.353, 9.297), L(24, 25, 1.078, 0.546),
  L(24, 26, 17.267, 8.746), L(26, 27, 10.786, 5.463), L(27, 28, 4.314, 2.185), L(26, 52, 2.157, 1.092), L(26, 29, 4.315, 2.186), L(29, 30, 4.314, 2.185),
  L(4, 31, 40.059, 19.949), L(31, 32, 2.157, 1.092), L(31, 33, 37.858, 18.833), L(33, 34, 5.395, 2.732), L(33, 35, 32.427, 16.086), L(35, 36, 8.629, 4.154),
  L(35, 37, 16.188, 8.199), L(37, 38, 8.629, 4.37), L(37, 40, 7.55, 3.824), L(40, 41, 5.392, 2.731), L(35, 42, 7.553, 3.825), L(42, 43, 2.157, 1.092),
  L(42, 44, 5.394, 2.732), L(44, 45, 5.393, 2.731), L(7, 46, 14.909, 7.552), L(46, 47, 14.907, 7.551), L(47, 48, 14.901, 7.547), L(48, 49, 6.471, 3.277),
  L(48, 50, 1.952, 0.989), L(48, 51, 6.471, 3.277),
]

export const busById = new Map(BUSES.map((b) => [b.id, b]))

/** IAMMETER meters placed on the network. `verified: false` = bus chosen by best match; confirm on site. */
export const METER_BUS: { sn: string; bus: number; verified: boolean }[] = [
  { sn: 'main-transformer', bus: 1, verified: false }, // Main Transformer incomer (LV side)
  { sn: 'block-10', bus: 5, verified: false }, // Block 10
  { sn: 'block-11', bus: 6, verified: false }, // Block 11 – Civil Engineering
  { sn: 'block-8', bus: 49, verified: false }, // Block 8 – Electrical Engineering
  { sn: 'boys-hostel', bus: 38, verified: false }, // Boys Hostel
  { sn: 'block-7', bus: 19, verified: false }, // Block 7 – Biotechnology (two Biotech buses on the study map)
  { sn: 'block-6', bus: 16, verified: false }, // Block 6 – Physics (placed at the science block)
]

/* ---------- topology helpers ---------- */
const children = new Map<number, number[]>()
const parentLine = new Map<number, Line>()
for (const l of LINES) { children.set(l.from, [...(children.get(l.from) ?? []), l.to]); parentLine.set(l.to, l) }

export function pathToRoot(bus: number): Line[] {
  const out: Line[] = []
  let b = bus
  while (parentLine.has(b)) { const l = parentLine.get(b)!; out.push(l); b = l.from }
  return out
}

export function downstream(bus: number): number[] {
  const out: number[] = []
  const st = [bus]
  while (st.length) { const b = st.pop()!; out.push(b); for (const c of children.get(b) ?? []) st.push(c) }
  return out
}

/* ---------- live status inference ---------- */
export type MeterState = 'live' | 'stale' | 'nodata' | 'outage' | 'phase-loss' | 'overload' | 'demo'

export const STATE_META: Record<MeterState, { label: string; color: string; short: string; explain: string }> = {
  live: { label: 'Live', short: 'Live', color: 'rgb(var(--ok))', explain: 'Meter reporting normally.' },
  demo: { label: 'Demo data', short: 'Demo', color: 'rgb(var(--sun))', explain: 'Synthetic demonstration reading — the live bridge is not connected.' },
  stale: { label: 'No recent data', short: 'Stale', color: 'rgb(var(--warn))', explain: 'No fresh validated reading; cause unverified. Missing messages do not confirm a power or line failure.' },
  nodata: { label: 'No data', short: 'No data', color: 'rgb(var(--ink3))', explain: 'No validated reading available. Meter power, publishing and network connection are unverified.' },
  outage: { label: 'Low voltage: all phases', short: 'Low V', color: 'rgb(var(--bad))', explain: 'Received voltages are below 40 V on all phases. This does not locate or confirm an equipment fault.' },
  'phase-loss': { label: 'Low phase voltage', short: 'Low phase V', color: 'rgb(var(--bad))', explain: 'One or two received phase voltages are below 40 V. Verify on site; conductor and breaker states are unknown.' },
  overload: { label: 'Above research rating', short: 'High kVA', color: 'rgb(var(--bad))', explain: 'Apparent power exceeds the assumed 200 kVA research rating; confirm the nameplate.' },
}

export const V_DEAD = 40 // V: a phase below this is treated as de-energised

export function inferState(r: MeterReading | null, opts: { live: boolean; ageMs: number; ratedKva?: number;staleAfterMs?:number }): MeterState {
  if (!opts.live) return 'demo'
  if (!r) return 'nodata'
  if (opts.ageMs > (opts.staleAfterMs??120_000)) return 'stale'
  const dead = [r.va, r.vb, r.vc].filter((v) => !(v > V_DEAD)).length
  if (dead === 3) return 'outage'
  if (dead > 0) return 'phase-loss'
  if (opts.ratedKva) {
    const s = (r.va * r.ia + r.vb * r.ib + r.vc * r.ic) / 1000
    if (s > opts.ratedKva) return 'overload'
  }
  return 'live'
}

/* ---------- short-term forecast ---------- */
export interface Forecast { points: { t: number; p: number }[]; basis: string }

/**
 * Next-hours demand forecast.
 * With ≥ 24 h of history: seasonal-naive — hour-of-day average of earlier days, scaled by the ratio
 * of the latest reading to that profile at the current hour.
 * With insufficient history or hourly coverage: no forecast is emitted.
 */
export function forecastNextHours(history: { t: number; p: number }[], latest: { t: number; p: number }, hours = 3): Forecast {
  const now = latest.t
  if(!Number.isFinite(latest.t)||!Number.isFinite(latest.p))return{points:[],basis:'No valid latest reading.'}
  const past = history.filter((x) => Number.isFinite(x.p)&&Number.isFinite(x.t)&&x.t < now - 3600_000).sort((a,b)=>a.t-b.t)
  const span = past.length ? (now - past[0].t) / 3600_000 : 0
  const points: { t: number; p: number }[] = []
  if (span >= 24) {
    const sum = new Array(24).fill(0), n = new Array(24).fill(0)
    for (const x of past) { const h = new Date(x.t+20700000).getUTCHours(); sum[h] += x.p; n[h]++ }
    const prof = sum.map((s, h) => (n[h] ? s / n[h] : NaN))
    if(n.filter(x=>x>0).length<24)return{points:[],basis:'Incomplete daily coverage. A forecast needs observations in all 24 local hours.'}
    const hNow = new Date(now+20700000).getUTCHours()
    const ratio = prof[hNow] > 0 ? latest.p / prof[hNow] : 1
    for (let k = 1; k <= hours * 4; k++) {
      const t = now + k * 900_000
      const h = new Date(t+20700000).getUTCHours()
      points.push({ t, p: Math.max(0, (Number.isFinite(prof[h]) ? prof[h] : latest.p) * ratio) })
    }
    return { points, basis: `Seasonal-naive: average of ${Math.floor(span / 24)} earlier day(s) at each hour, scaled to the latest reading.` }
  }
  return {points:[],basis:`Insufficient stored history (${span.toFixed(1)} h). Collect at least 24 h for an experimental day-profile forecast.`}
}

/** Season label following the energy study's segmentation (approximate calendar windows). */
export function studySeason(d: Date): 'winter' | 'summer' | 'festival' {
  const m = new Date(d.getTime()+20700000).getUTCMonth()
  if (m === 9) return 'festival'
  if (m >= 10 || m <= 1) return 'winter'
  return 'summer'
}
