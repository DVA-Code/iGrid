/**
 * Thermal Sensitivity model — exact implementation of the published regression.
 * Source: "Data-Driven Dynamic Thermal Sensitivity Modeling of a 3-Phase Distribution
 * Transformer Using Electrical Operating Parameters", Sections 2.3–2.5, 3.3.3, 4.3.
 *
 * Output θ1hr is a model-derived thermal-response level, NOT a temperature in °C.
 */

export const THERMAL_MODEL = {
  version: 'thermal-tau1-v1.0',
  intercept: -0.97180955,
  bIeq2: 0.00004761,
  cIimb: 0.00083054,
  dVdev: 0.00190004,
  vRef: 240.0981,
  thetaMin: -0.86,
  thetaMax: 2.83,
} as const

export interface PhaseReading {
  va: number; vb: number; vc: number
  ia: number; ib: number; ic: number
}

export type Quality = 'ok' | 'no-load' | 'invalid'

export type TsiCategory = 'below' | 'low' | 'moderate' | 'high' | 'veryhigh' | 'critical' | 'above'

export const TSI_CATEGORIES: { id: TsiCategory; label: string; from: number; to: number; color: string }[] = [
  { id: 'low', label: 'Low', from: 0, to: 0.2, color: '#3FB37F' },
  { id: 'moderate', label: 'Moderate', from: 0.2, to: 0.4, color: '#E2C044' },
  { id: 'high', label: 'High', from: 0.4, to: 0.6, color: '#EE8B3A' },
  { id: 'veryhigh', label: 'Very High', from: 0.6, to: 0.8, color: '#E5484D' },
  { id: 'critical', label: 'Critical', from: 0.8, to: 1.0, color: '#9B1C31' },
]

const finite = (...xs: number[]) => xs.every((x) => Number.isFinite(x))

export function equivalentCurrentSquared(ia: number, ib: number, ic: number): number {
  return (ia * ia + ib * ib + ic * ic) / 3
}

/** Thermal-study imbalance: (Imax − Imin) / Iavg × 100. Returns null when Iavg ≈ 0. */
export function currentImbalance(ia: number, ib: number, ic: number): number | null {
  const avg = (ia + ib + ic) / 3
  if (!finite(avg) || Math.abs(avg) < 1e-6) return null
  return ((Math.max(ia, ib, ic) - Math.min(ia, ib, ic)) / avg) * 100
}

export function voltageDeviation(va: number, vb: number, vc: number, vRef = THERMAL_MODEL.vRef): number {
  return (va + vb + vc) / 3 - vRef
}

export function thermalResponse(ieq2: number, iimb: number, vdev: number): number {
  const m = THERMAL_MODEL
  return m.intercept + m.bIeq2 * ieq2 + m.cIimb * iimb + m.dVdev * vdev
}

export function tsi(theta: number): number {
  const m = THERMAL_MODEL
  return (theta - m.thetaMin) / (m.thetaMax - m.thetaMin)
}

/** Lower-inclusive, non-overlapping bands. 1.0 exactly is Critical. Outside [0,1] flagged. */
export function classifyTsi(value: number): TsiCategory {
  if (value < 0) return 'below'
  if (value > 1) return 'above'
  if (value < 0.2) return 'low'
  if (value < 0.4) return 'moderate'
  if (value < 0.6) return 'high'
  if (value < 0.8) return 'veryhigh'
  return 'critical'
}

export function categoryMeta(cat: TsiCategory) {
  if (cat === 'below') return { id: cat, label: 'Below reference range', color: '#3FB37F' }
  if (cat === 'above') return { id: cat, label: 'Above reference range', color: '#9B1C31' }
  const c = TSI_CATEGORIES.find((x) => x.id === cat)!
  return { id: cat, label: c.label, color: c.color }
}

export interface ThermalResult {
  ieq2: number
  iavg: number
  iimb: number
  vavg: number
  vdev: number
  theta: number
  tsiRaw: number
  tsiDisplay: number
  category: TsiCategory
  outOfRange: boolean
  quality: Quality
  terms: { intercept: number; current: number; imbalance: number; voltage: number }
  phaseShares: { a: number; b: number; c: number }
  version: string
}

export function computeThermal(r: PhaseReading): ThermalResult {
  const m = THERMAL_MODEL
  let quality: Quality = 'ok'
  if (!finite(r.va, r.vb, r.vc, r.ia, r.ib, r.ic) || r.ia < 0 || r.ib < 0 || r.ic < 0) quality = 'invalid'
  const ieq2 = equivalentCurrentSquared(r.ia, r.ib, r.ic)
  const iavg = (r.ia + r.ib + r.ic) / 3
  const imbRaw = currentImbalance(r.ia, r.ib, r.ic)
  if (imbRaw === null && quality === 'ok') quality = 'no-load'
  const iimb = imbRaw ?? 0
  const vavg = (r.va + r.vb + r.vc) / 3
  const vdev = vavg - m.vRef
  const terms = {
    intercept: m.intercept,
    current: m.bIeq2 * ieq2,
    imbalance: m.cIimb * iimb,
    voltage: m.dVdev * vdev,
  }
  const theta = terms.intercept + terms.current + terms.imbalance + terms.voltage
  const tsiRaw = tsi(theta)
  const sumSq = r.ia * r.ia + r.ib * r.ib + r.ic * r.ic || 1
  return {
    ieq2, iavg, iimb, vavg, vdev, theta, tsiRaw,
    tsiDisplay: Math.min(1, Math.max(0, tsiRaw)),
    category: classifyTsi(tsiRaw),
    outOfRange: tsiRaw < 0 || tsiRaw > 1,
    quality,
    terms,
    phaseShares: { a: (r.ia * r.ia) / sumSq, b: (r.ib * r.ib) / sumSq, c: (r.ic * r.ic) / sumSq },
    version: m.version,
  }
}

/** Published research facts (Tables 1–6). Tag: REPORTED. */
export const THERMAL_REPORTED = {
  period: '1 July 2025 – 30 June 2026',
  interval: '1 hour',
  split: { training: 5901, validation: 1264, test: 1265, total: 8430 },
  candidates: [
    { tau: 1, a: -0.97181, b: 4.7607e-5, c: 0.00083054, d: 0.00190004, testR2: 0.954241 },
    { tau: 2, a: -0.92744, b: 4.2793e-5, c: 0.0022227, d: 0.0033474, testR2: 0.81 },
    { tau: 4, a: -0.85285, b: 3.5245e-5, c: 0.00427, d: 0.0055054, testR2: 0.55 },
    { tau: 6, a: -0.80889, b: 3.099e-5, c: 0.0053768, d: 0.0072743, testR2: 0.33 },
    { tau: 8, a: -0.78226, b: 2.8493e-5, c: 0.0060102, d: 0.0083243, testR2: 0.15 },
    { tau: 12, a: -0.75205, b: 2.5782e-5, c: 0.0066772, d: 0.0092646, testR2: -0.1 },
    { tau: 24, a: -0.71547, b: 2.2872e-5, c: 0.0073488, d: 0.0099501, testR2: -0.7 },
  ],
  performance: [
    { set: 'Training (70%)', r2: 0.967039, adjR2: 0.967022, rmse: 0.172908, mae: null, maxErr: null },
    { set: 'Validation (15%)', r2: 0.947434, adjR2: 0.947309, rmse: 0.134114, mae: 0.092149, maxErr: 0.720713 },
    { set: 'Test (15%)', r2: 0.954241, adjR2: 0.954132, rmse: 0.177875, mae: 0.107884, maxErr: 0.960332 },
  ],
}
