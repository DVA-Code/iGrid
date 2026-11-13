/**
 * PV inverter simulation engine — SPWM generation, H-bridge states, LC filter,
 * FFT/THD and coulomb-counting SOC. Every output here is SIMULATED or CALCULATED;
 * reported experimental values live in INVERTER_REPORTED.
 *
 * Switching scheme modelled on the report (Sec. 3.2 / 4.2.1): leg A compares the sine
 * reference with a triangle carrier, leg B compares the inverted sine with the same
 * carrier (180° shifted), giving a 3-level bridge output (+Vdc, 0, −Vdc) whose first
 * switching sideband sits near twice the carrier frequency.
 */

export interface SpwmParams {
  fRef: number // Hz
  fCarrier: number // Hz
  m: number // modulation index 0..1.2
  deadTimeUs: number
  vdc: number
}

export const PROTOTYPE_PRESET: SpwmParams = {
  fRef: 50,
  fCarrier: 16e6 / (2 * 255), // ≈ 31 373 Hz — Arduino Timer phase-correct, TOP 255, prescaler 1
  m: 117 / 127.5, // derived from lookup table 1 (centre ≈117, amplitude ≈117 counts of a 0–255 timer)
  deadTimeUs: 20, // observed on oscilloscope (reported)
  vdc: 12,
}

export const tri = (t: number, f: number) => {
  // unipolar-centred triangle in [-1, 1]
  const x = (t * f) % 1
  return x < 0.5 ? 4 * x - 1 : 3 - 4 * x
}

export interface SpwmSample {
  t: number; ref: number; carrier: number
  q1: number; q2: number; q3: number; q4: number // gate states 0/1 (M1/M2 leg A high/low, M3/M4 leg B high/low)
  vab: number
}

/** Sample the switching waveforms. Dead time applied to the rising edge of each gate. */
export function simulateSpwm(p: SpwmParams, tStart: number, tEnd: number, n: number): SpwmSample[] {
  const out: SpwmSample[] = []
  const dt = (tEnd - tStart) / (n - 1)
  const td = p.deadTimeUs * 1e-6
  const legState = (t: number, sign: 1 | -1) => sign * p.m * Math.sin(2 * Math.PI * p.fRef * t) > tri(t, p.fCarrier)
  for (let i = 0; i < n; i++) {
    const t = tStart + i * dt
    const ref = p.m * Math.sin(2 * Math.PI * p.fRef * t)
    const a = legState(t, 1)
    const b = legState(t, -1)
    // a gate turns on only if the leg command has been stable for td (rising-edge delay)
    const aStable = legState(t - td, 1) === a
    const bStable = legState(t - td, -1) === b
    const q1 = a && aStable ? 1 : 0
    const q2 = !a && aStable ? 1 : 0
    const q3 = b && bStable ? 1 : 0
    const q4 = !b && bStable ? 1 : 0
    // During dead time both devices of a leg are off; the leg node is modelled at its previous
    // state (freewheeling-diode assumption, inductive current continuous). Documented assumption.
    const legA = q1 ? 1 : q2 ? 0 : (legState(t - td, 1) ? 1 : 0)
    const legB = q3 ? 1 : q4 ? 0 : (legState(t - td, -1) ? 1 : 0)
    out.push({ t, ref, carrier: tri(t, p.fCarrier), q1, q2, q3, q4, vab: p.vdc * (legA - legB) })
  }
  return out
}

export const HBRIDGE_STATES = [
  { on: ['M1', 'M4'], out: '+Vdc', valid: true, path: 'Vdc → M1 → load → M4 → GND' },
  { on: ['M1', 'M3'], out: '0', valid: true, path: 'Freewheel through upper devices' },
  { on: ['M2', 'M3'], out: '−Vdc', valid: true, path: 'Vdc → M3 → load → M2 → GND' },
  { on: ['M2', 'M4'], out: '0', valid: true, path: 'Freewheel through lower devices' },
  { on: ['M1', 'M2'], out: 'Short', valid: false, path: 'Shoot-through: Vdc shorted to GND through leg A' },
  { on: ['M3', 'M4'], out: 'Short', valid: false, path: 'Shoot-through: Vdc shorted to GND through leg B' },
]

// ---------- FFT ----------
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang), wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k]
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr
        re[i + k] = ur + vr; im[i + k] = ui + vi
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi
        const nr = cr * wr - ci * wi
        ci = cr * wi + ci * wr; cr = nr
      }
    }
  }
}

export function ifft(re: Float64Array, im: Float64Array) {
  for (let i = 0; i < im.length; i++) im[i] = -im[i]
  fft(re, im)
  const n = re.length
  for (let i = 0; i < n; i++) { re[i] /= n; im[i] = -im[i] / n }
}

/**
 * One fundamental period sampled coherently with N = 2^k points.
 * Bin n of the spectrum is harmonic n of fRef. Returns RMS amplitude per bin.
 */
export function periodBridgeWave(p: SpwmParams, log2n = 16): Float64Array {
  const n = 1 << log2n
  const T = 1 / p.fRef
  const s = simulateSpwm(p, 0, T * (1 - 1 / n), n)
  return Float64Array.from(s.map((x) => x.vab))
}

export function rmsSpectrum(x: Float64Array) {
  const n = x.length
  const re = Float64Array.from(x)
  const im = new Float64Array(n)
  fft(re, im)
  const half = n / 2
  const mag = new Float64Array(half)
  for (let k = 1; k < half; k++) mag[k] = (Math.sqrt(re[k] ** 2 + im[k] ** 2) * 2) / n / Math.SQRT2
  mag[0] = Math.abs(re[0]) / n
  return mag
}

/** THD = sqrt(Σ_{n=2..N} Vn²) / V1 × 100 using harmonic bins (coherent sampling). */
export function thdFromSpectrum(mag: Float64Array, maxHarmonic = mag.length - 1): number {
  const v1 = mag[1]
  if (v1 <= 0) return NaN
  let s = 0
  for (let k = 2; k <= Math.min(maxHarmonic, mag.length - 1); k++) s += mag[k] ** 2
  return (Math.sqrt(s) / v1) * 100
}

/** THD from dBc harmonic table: sqrt(Σ 10^(dBc/10)) × 100 (method used in the report). */
export function thdFromDbc(dbc: number[]): number {
  return Math.sqrt(dbc.reduce((s, d) => s + 10 ** (d / 10), 0)) * 100
}

// ---------- LC filter ----------
export const lcCutoff = (L: number, C: number) => 1 / (2 * Math.PI * Math.sqrt(L * C))

/**
 * Series-L shunt-C low-pass with optional resistive load R (Ω, Infinity = unloaded) and
 * inductor series resistance esr (Ω). ESR is a modelling assumption (default 0.5 Ω) that
 * gives the resonance finite damping, as any real inductor has.
 * H = 1 / (1 + esr/R − ω²LC + jω(L/R + esr·C))
 */
export const LC_ESR_DEFAULT = 0.5
export function lcResponse(f: number, L: number, C: number, R = Infinity, esr = LC_ESR_DEFAULT) {
  const w = 2 * Math.PI * f
  const re = 1 + (Number.isFinite(R) ? esr / R : 0) - w * w * L * C
  const im = (Number.isFinite(R) ? (w * L) / R : 0) + w * esr * C
  const den = re * re + im * im
  return { re: re / den, im: -im / den, mag: 1 / Math.sqrt(den) }
}

/** Apply the filter to a coherently sampled period (steady state) via FFT. */
export function filterPeriod(x: Float64Array, fRef: number, L: number, C: number, R = Infinity, esr = LC_ESR_DEFAULT): Float64Array {
  const n = x.length
  const re = Float64Array.from(x)
  const im = new Float64Array(n)
  fft(re, im)
  for (let k = 0; k < n; k++) {
    const kk = k <= n / 2 ? k : k - n
    const h = lcResponse(Math.abs(kk) * fRef, L, C, R, esr)
    const hi = kk < 0 ? -h.im : h.im
    const r = re[k] * h.re - im[k] * hi
    const i = re[k] * hi + im[k] * h.re
    re[k] = r; im[k] = i
  }
  ifft(re, im)
  return re
}

export const rms = (x: ArrayLike<number>) => {
  let s = 0
  for (let i = 0; i < x.length; i++) s += x[i] * x[i]
  return Math.sqrt(s / x.length)
}

// ---------- Battery / coulomb counting ----------
export interface BatteryParams {
  capacityAh: number
  socStart: number // 0..1 (estimated initial)
  trueSocStart: number // 0..1 (actual initial, for drift demonstration)
  sensorOffsetA: number // added to measured current
  socMin: number
  socMax: number
}

export type ControllerState = 'overdischarged' | 'normal' | 'overcharged'

/** Report Table 5: <50 % → load off; 50–90 % normal; >90 % → charging off. */
export function controllerState(soc: number, min = 0.5, max = 0.9): { state: ControllerState; switch1: boolean; switch2: boolean } {
  if (soc < min) return { state: 'overdischarged', switch1: true, switch2: false }
  if (soc > max) return { state: 'overcharged', switch1: false, switch2: true }
  return { state: 'normal', switch1: true, switch2: true }
}

/** Signed convention: positive current = charging. Returns new SOC (0..1, clamped). */
export function coulombStep(soc: number, currentA: number, dtS: number, capacityAh: number) {
  const qn = capacityAh * 3600
  return Math.min(1, Math.max(0, soc + (currentA * dtS) / qn))
}

export interface BatterySample { tH: number; soc: number; trueSoc: number; current: number; state: ControllerState }

export function simulateBattery(p: BatteryParams, profile: (tH: number) => number, hours: number, stepS = 60): BatterySample[] {
  let soc = p.socStart, trueSoc = p.trueSocStart
  const out: BatterySample[] = []
  for (let t = 0; t <= hours * 3600; t += stepS) {
    const tH = t / 3600
    let I = profile(tH)
    const st = controllerState(soc, p.socMin, p.socMax)
    if (I > 0 && !st.switch1) I = 0
    if (I < 0 && !st.switch2) I = 0
    out.push({ tH, soc, trueSoc, current: I, state: st.state })
    trueSoc = coulombStep(trueSoc, I, stepS, p.capacityAh)
    soc = coulombStep(soc, I + p.sensorOffsetA, stepS, p.capacityAh)
  }
  return out
}

// ---------- Exploratory load model ----------
/** Linear resistive Thevenin equivalent: V = Voc · RL / (RL + Rs). Exploratory only. */
export const theveninOutput = (voc: number, rs: number, rl: number) => (voc * rl) / (rl + rs)
/** Equivalent source resistance implied by two measured points, assuming a linear resistive source. */
export const impliedSourceR = (voc: number, vLoaded: number, rl: number) => rl * (voc / vLoaded - 1)

/** Published values. Tag: REPORTED unless noted. */
export const INVERTER_REPORTED = {
  noLoadV: 145,
  loadedV: 15.83,
  loadOhm: 1000,
  targetV: 220,
  filterRmsV: 8.2,
  filterScopeRmsV: 7.16,
  thdFilter: 5.31,
  thdTransformer: 34.66,
  measuredSwitchingKHz: 12,
  deadTimeObservedUs: 20,
  deadTimeConstC: 40,
  L: 250e-6,
  C: 1e-6,
  designCutoffHz: 10_000,
  lookupN: 627,
  clkHz: 16e6,
  timerTop: 255,
  harmonicsHz: [100, 150, 200, 250, 300, 350, 400, 450, 500],
  filterDbc: [-31.2, -31.2, -39.6, -37.4, -48.4, -32.4, -44, -34.4, -45.2],
  transformerDbc: [-29.6, -11.2, -29.6, -16, -31.2, -20.2, -32.6, -24.8, -34.4],
  mosfet: { rdsOn: 17.5e-3, conductionUw: 2 * 4.9965, switchingUw: 12.096, vin: 12, idA: 0.8e-3, trNs: 60, tfNs: 45, fswHz: 12_000 },
  bootstrap: { qg: 63e-9, vq1: 12 - 0.7 },
  shunt: { r: 0.1, gain: 100, vref: 1.1 },
  capacitorTest: { cF: 4700e-6, v: 5, intended: 0.9, observed: 0.5 },
  codeConstants: { socMax: 0.8, socMin: 0.3, cTotal: 252000, offsetA: -0.01 },
  controllerTable: [
    { soc: '< 50 %', status: 'Overdischarged', s1: 'ON', s2: 'OFF' },
    { soc: '50 – 90 %', status: 'Normal', s1: 'ON', s2: 'ON' },
    { soc: '> 90 %', status: 'Overcharged', s1: 'OFF', s2: 'ON' },
  ],
  limitations: [
    'Final output is around 145 V instead of the ideal 220 V.',
    'Voltage drop is too high to drive a load.',
    'Leakage current makes SOC measurement inaccurate over time.',
    'The inverter PCB shorted the power supply with the Arduino; this could not be fixed.',
  ],
  futureWork: [
    'Improve the inverter circuit so it can power loads.',
    'Make the charge controller more robust with regular automated calibration to reduce drift.',
    'Reduce THD further with higher-level inverters and other techniques.',
  ],
}

export const derived = {
  carrierHz: INVERTER_REPORTED.clkHz / (2 * INVERTER_REPORTED.timerTop),
  fundamentalHz: (INVERTER_REPORTED.clkHz / (2 * INVERTER_REPORTED.timerTop)) / INVERTER_REPORTED.lookupN,
  deadTimeFormulaUs: (INVERTER_REPORTED.deadTimeConstC / INVERTER_REPORTED.clkHz) * 1e6,
  cutoffHz: lcCutoff(INVERTER_REPORTED.L, INVERTER_REPORTED.C),
  thdFilterRecomputed: thdFromDbc(INVERTER_REPORTED.filterDbc),
  thdTransformerRecomputed: thdFromDbc(INVERTER_REPORTED.transformerDbc),
  cg: INVERTER_REPORTED.bootstrap.qg / INVERTER_REPORTED.bootstrap.vq1,
  impliedRs: impliedSourceR(INVERTER_REPORTED.noLoadV, INVERTER_REPORTED.loadedV, INVERTER_REPORTED.loadOhm),
  chargeErrorC: 0.4 * INVERTER_REPORTED.capacitorTest.cF * INVERTER_REPORTED.capacitorTest.v,
  vminMv: (INVERTER_REPORTED.shunt.vref / 1024) * 1000,
  imaxMa: (INVERTER_REPORTED.shunt.vref / INVERTER_REPORTED.shunt.gain / INVERTER_REPORTED.shunt.r) * 1000,
  correct7AhCoulombs: 7 * 3600,
}
