/**
 * Campus energy analytics — equations from "Energy Analytics of Kathmandu University",
 * Table II. VUF and CUF here are the paper's max-deviation-from-average definitions,
 * NOT negative-sequence unbalance factors, and differ from the thermal study's imbalance.
 */

export const ENERGY_CONFIG = {
  version: 'energy-v1.0',
  ratedKva: 200, // per research reports — verify against nameplate
  vufReference: 2.0, // % reference level (IEC 61000-3-13) used in the paper
  cufAssessment: 10.0, // % practical assessment threshold used in the study (not a standard)
  assumedPf: 0.8, // used ONLY for the paper's historical benchmark
  benchmarkKw: 160, // 200 kVA × 0.8 — assumed
}

export interface MeterReading {
  t: number // epoch ms
  va: number; vb: number; vc: number
  ia: number; ib: number; ic: number
  pfa: number; pfb: number; pfc: number
  pKw?: number // meter-reported active power if available
  freq?: number
}

export function maxDeviationFactor(a: number, b: number, c: number): number | null {
  const avg = (a + b + c) / 3
  if (!Number.isFinite(avg) || Math.abs(avg) < 1e-6) return null
  return (Math.max(Math.abs(a - avg), Math.abs(b - avg), Math.abs(c - avg)) / avg) * 100
}

export const vuf = (va: number, vb: number, vc: number) => maxDeviationFactor(va, vb, vc)
export const cuf = (ia: number, ib: number, ic: number) => maxDeviationFactor(ia, ib, ic)

export function activePowerKw(r: MeterReading): number {
  if (r.pKw !== undefined && Number.isFinite(r.pKw)) return r.pKw
  return (r.va * r.ia * r.pfa + r.vb * r.ib * r.pfb + r.vc * r.ic * r.pfc) / 1000
}

export function apparentPowerKva(r: Pick<MeterReading, 'va' | 'vb' | 'vc' | 'ia' | 'ib' | 'ic'>): number {
  return (r.va * r.ia + r.vb * r.ib + r.vc * r.ic) / 1000
}

export function loadingPercent(sKva: number, rated = ENERGY_CONFIG.ratedKva): number {
  return (sKva / rated) * 100
}

/** Q = P·tan(acos(PF)). PF must be measured for live data; assumed PF only for the paper's analysis. */
export function reactivePowerKvar(pKw: number, pf: number): number {
  const p = Math.min(1, Math.max(1e-6, Math.abs(pf)))
  return pKw * Math.tan(Math.acos(p))
}

/** Trapezoidal energy integration using actual timestamp gaps. Gaps > maxGapH are skipped. */
export function integrateEnergyKwh(points: { t: number; p: number }[], maxGapH = 1.5): number {
  let e = 0
  for (let i = 1; i < points.length; i++) {
    const dtH = (points[i].t - points[i - 1].t) / 3_600_000
    if (dtH <= 0 || dtH > maxGapH) continue
    e += ((points[i].p + points[i - 1].p) / 2) * dtH
  }
  return e
}

export function peakOffPeak<T extends { p: number }>(rows: T[]) {
  if (!rows.length) return null
  let hi = 0, lo = 0
  rows.forEach((r, i) => { if (r.p > rows[hi].p) hi = i; if (r.p < rows[lo].p) lo = i })
  return { peak: rows[hi], peakIndex: hi, off: rows[lo], offIndex: lo }
}

export function hourlyAverage(rows: { t: number; p: number }[]) {
  const buckets = new Map<number, { sum: number; n: number }>()
  for (const r of rows) {
    const h = Math.floor((r.t+20700000) / 3_600_000) * 3_600_000-20700000
    const b = buckets.get(h) ?? { sum: 0, n: 0 }
    b.sum += r.p; b.n++
    buckets.set(h, b)
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([t, b]) => ({ t, p: b.sum / b.n }))
}

export interface EnergyResult {
  pKw: number; sKva: number; qKvar: number; pf: number
  loading: number; vavg: number; iavg: number
  vuf: number | null; cuf: number | null
  maxPhase: 'a' | 'b' | 'c'
  deviations: { a: number; b: number; c: number } // % from average current
}

export function computeEnergy(r: MeterReading): EnergyResult {
  const pKw = activePowerKw(r)
  const sKva = apparentPowerKva(r)
  const pf = sKva > 0 ? Math.min(1, pKw / sKva) : 0
  const iavg = (r.ia + r.ib + r.ic) / 3
  const maxPhase = r.ia >= r.ib && r.ia >= r.ic ? 'a' : r.ib >= r.ic ? 'b' : 'c'
  const dev = (x: number) => (iavg > 0 ? ((x - iavg) / iavg) * 100 : 0)
  return {
    pKw, sKva, pf,
    qKvar: Math.sqrt(Math.max(0, sKva * sKva - pKw * pKw)),
    loading: loadingPercent(sKva),
    vavg: (r.va + r.vb + r.vc) / 3,
    iavg,
    vuf: vuf(r.va, r.vb, r.vc),
    cuf: cuf(r.ia, r.ib, r.ic),
    maxPhase,
    deviations: { a: dev(r.ia), b: dev(r.ib), c: dev(r.ic) },
  }
}

/** Published values (Tables III–V, Figs. 2, 5, 6). Tag: REPORTED. */
export const ENERGY_REPORTED = {
  meters: 7,
  ctRating: '500 A split-core',
  meter: 'IAMMETER WEM3080T',
  rawInterval: '5 min (288 samples/day)',
  seasons: [
    { id: 'summer', label: 'Summer', note: 'Warm months, near-full occupancy', peakHour: 11, peakKw: 100, offHour: 4, offKw: 75, weekdayPeakKw: 107, vuf: 0.5, cuf: 14.02, meanKw: 76.3 },
    { id: 'winter', label: 'Winter', note: 'Cold months, full academic activity plus heating and lighting', peakHour: 11, peakKw: 145, offHour: 4, offKw: 96, weekdayPeakKw: 165, vuf: 0.78, cuf: 18.62, meanKw: 109.6 },
    { id: 'festival', label: 'Festival', note: 'Major holidays (Dashain/Tihar), reduced occupancy', peakHour: 10, peakKw: 60, offHour: 17, offKw: 45, weekdayPeakKw: 65, vuf: 0.66, cuf: 15.57, meanKw: 54.8 },
  ],
  observations: [
    'Winter evening VUF peaks ≈ 1.17 %, still well below the 2 % reference.',
    'CUF reaches ≈ 25 % on winter mornings (≈ 08:00).',
    'CUF drops below 10 % only in summer late-night hours (03:00–05:00).',
    'Winter active power approaches and briefly exceeds the 160 kW benchmark at midday.',
    'Reactive power (at assumed PF 0.8) peaks near 120 kVAR in winter midday.',
  ],
  recommendations: [
    { title: 'Shift winter peak load', body: 'Move non-critical loads (water heaters, chillers, AC units) outside 09:00–14:00 through demand-side management; evaluate a capacity upgrade or a second parallel unit in the medium term.' },
    { title: 'Rebalance phases', body: 'Audit distribution-board phase loading and redistribute single-phase loads to reduce CUF and copper losses; consider automatic phase-balancing devices where manual rebalancing is impractical.' },
    { title: 'Demand response and renewables', body: 'Evaluate rooftop PV with battery storage for peak shaving and an internal demand-response scheme.' },
    { title: 'Power-factor correction', body: 'Substantial winter reactive demand suggests capacitor banks could reduce kVA loading during peak hours.' },
  ],
}
