/**
 * DEMO data generator — clearly synthetic readings shaped like a campus day at the
 * KU main-transformer incomer. Shapes follow the qualitative patterns in the reports
 * (morning ramp, ~10–11 h peak, evening secondary rise, voltage dip under load,
 * load-side current imbalance) but are NOT recorded measurements. Always tagged DEMO.
 */
import type { MeterReading } from '../models/energy'

export type Season = 'summer' | 'winter' | 'festival'

function hash(n: number) {
  let x = (n | 0) ^ 0x9e3779b9
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b)
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35)
  x ^= x >>> 16
  return (x >>> 0) / 4294967295
}
const noise = (seed: number, amp: number) => (hash(seed) - 0.5) * 2 * amp

const gauss = (x: number, mu: number, s: number) => Math.exp(-((x - mu) ** 2) / (2 * s * s))

/** Normalised load shape 0..1 over hour-of-day (fractional). */
export function loadShape(h: number) {
  const base = 0.28
  const morning = 0.72 * gauss(h, 10.5, 1.9)
  const plateau = 0.42 * gauss(h, 14.5, 2.4)
  const evening = 0.3 * gauss(h, 19.5, 1.6)
  return Math.min(1, base + morning + plateau + evening)
}

export function seasonOf(d: Date): Season {
  const m = d.getMonth() // 0 = Jan
  const day = d.getDate()
  if (m === 9 && day >= 1 && day <= 31) return 'festival' // Dashain/Tihar window (approximate, demo only)
  if (m >= 10 || m <= 1) return 'winter'
  return 'summer'
}

const seasonScale: Record<Season, number> = { winter: 1.0, summer: 0.72, festival: 0.42 }

export function demoReading(t: number, season?: Season): MeterReading {
  const d = new Date(t)
  const h = d.getHours() + d.getMinutes() / 60
  const s = season ?? seasonOf(d)
  const weekend = d.getDay() === 0 || d.getDay() === 6
  const slot = Math.floor(t / 300_000) // 5-min slot for noise
  const scale = seasonScale[s] * (weekend ? 0.78 : 1)
  const shape = loadShape(h)
  const iBase = 70 + 190 * shape * scale + noise(slot, 6)
  // load-side imbalance: higher during occupied hours, mostly on phase B
  const occ = gauss(h, 9, 2.2) * 0.6 + gauss(h, 15, 3) * 0.4
  const imb = 0.05 + 0.12 * occ * (s === 'summer' ? 0.8 : 1)
  const ia = Math.max(0, iBase * (1 - imb * 0.35) + noise(slot + 11, 4))
  const ib = Math.max(0, iBase * (1 + imb) + noise(slot + 23, 4))
  const ic = Math.max(0, iBase * (1 - imb * 0.65) + noise(slot + 37, 4))
  const vBase = 246 - 16 * shape * scale + noise(slot + 51, 0.8)
  const va = vBase + 0.6 + noise(slot + 61, 0.5)
  const vb = vBase - 1.1 + noise(slot + 71, 0.5)
  const vc = vBase + 0.3 + noise(slot + 81, 0.5)
  const pfBase = 0.9 - 0.06 * shape
  return {
    t,
    va, vb, vc, ia, ib, ic,
    pfa: Math.min(0.99, pfBase + noise(slot + 91, 0.01)),
    pfb: Math.min(0.99, pfBase - 0.01 + noise(slot + 93, 0.01)),
    pfc: Math.min(0.99, pfBase + 0.01 + noise(slot + 97, 0.01)),
    freq: 50 + noise(slot + 99, 0.06),
  }
}

/** Series at a fixed step (ms) ending at `end`. */
export function demoSeries(end: number, spanMs: number, stepMs: number, season?: Season): MeterReading[] {
  const start = Math.floor((end - spanMs) / stepMs) * stepMs
  const out: MeterReading[] = []
  for (let t = start; t <= end; t += stepMs) out.push(demoReading(t, season))
  return out
}

/**
 * Average daily profile (hourly) — DEMO shape mapped so its minimum equals `lowKw` and its
 * maximum equals `highKw` (pass the published off-peak and peak levels). Shape is illustrative.
 */
export function demoSeasonProfile(lowKw: number, highKw: number) {
  const raw = Array.from({ length: 24 }, (_, h) => loadShape(h))
  const lo = Math.min(...raw), hi = Math.max(...raw)
  return raw.map((v) => lowKw + ((v - lo) / (hi - lo)) * (highKw - lowKw))
}
