import { describe, expect, it } from 'vitest'
import { classifyTsi, computeThermal, currentImbalance, equivalentCurrentSquared, tsi } from './thermal'
import { activePowerKw, apparentPowerKva, computeEnergy, cuf, integrateEnergyKwh, loadingPercent, peakOffPeak, vuf } from './energy'
import {
  coulombStep, controllerState, derived, filterPeriod, lcCutoff, periodBridgeWave, PROTOTYPE_PRESET,
  rms, rmsSpectrum, simulateSpwm, thdFromDbc, thdFromSpectrum,
} from './inverter'

const ref = { va: 235, vb: 238, vc: 236, ia: 200, ib: 220, ic: 180 }

describe('thermal model (reference vector)', () => {
  const r = computeThermal(ref)
  it('features', () => {
    expect(r.ieq2).toBeCloseTo(40266.6667, 3)
    expect(r.iimb).toBeCloseTo(20, 9)
    expect(r.vdev).toBeCloseTo(-3.7647667, 6)
  })
  it('terms and theta', () => {
    expect(r.terms.current).toBeCloseTo(1.917096, 6)
    expect(r.terms.imbalance).toBeCloseTo(0.0166108, 6)
    expect(r.terms.voltage).toBeCloseTo(-0.0071532, 6)
    expect(r.theta).toBeCloseTo(0.954744, 5)
  })
  it('TSI and class', () => {
    expect(r.tsiRaw).toBeCloseTo(0.4918006, 6)
    expect(r.category).toBe('high')
  })
  it('boundaries', () => {
    expect(classifyTsi(0)).toBe('low')
    expect(classifyTsi(0.2)).toBe('moderate')
    expect(classifyTsi(0.4)).toBe('high')
    expect(classifyTsi(0.6)).toBe('veryhigh')
    expect(classifyTsi(0.8)).toBe('critical')
    expect(classifyTsi(1)).toBe('critical')
    expect(classifyTsi(-0.01)).toBe('below')
    expect(classifyTsi(1.01)).toBe('above')
  })
  it('raw TSI is preserved outside range', () => {
    const hi = computeThermal({ va: 240, vb: 240, vc: 240, ia: 300, ib: 300, ic: 300 })
    expect(hi.tsiRaw).toBeGreaterThan(1)
    expect(hi.tsiDisplay).toBe(1)
    expect(hi.outOfRange).toBe(true)
  })
  it('zero current is safe', () => {
    expect(currentImbalance(0, 0, 0)).toBeNull()
    const z = computeThermal({ va: 240, vb: 240, vc: 240, ia: 0, ib: 0, ic: 0 })
    expect(z.quality).toBe('no-load')
    expect(Number.isFinite(z.theta)).toBe(true)
  })
  it('normalisation endpoints', () => {
    expect(tsi(-0.86)).toBeCloseTo(0, 12)
    expect(tsi(2.83)).toBeCloseTo(1, 12)
    expect(equivalentCurrentSquared(3, 4, 0)).toBeCloseTo(25 / 3, 12)
  })
})

describe('energy analytics', () => {
  it('CUF/VUF max-deviation definitions', () => {
    expect(cuf(ref.ia, ref.ib, ref.ic)).toBeCloseTo(10, 9)
    expect(vuf(ref.va, ref.vb, ref.vc)).toBeCloseTo(0.7052186, 6)
    expect(cuf(100, 100, 100)).toBe(0)
    expect(cuf(0, 0, 0)).toBeNull()
  })
  it('apparent power and loading', () => {
    const s = apparentPowerKva(ref)
    expect(s).toBeCloseTo(141.84, 9)
    expect(loadingPercent(s)).toBeCloseTo(70.92, 9)
  })
  it('active power prefers meter value', () => {
    const r = { t: 0, ...ref, pfa: 0.9, pfb: 0.9, pfc: 0.9 }
    expect(activePowerKw(r)).toBeCloseTo(141.84 * 0.9, 9)
    expect(activePowerKw({ ...r, pKw: 99 })).toBe(99)
    expect(computeEnergy(r).maxPhase).toBe('b')
  })
  it('energy integration respects actual intervals', () => {
    const pts = [{ t: 0, p: 100 }, { t: 1_800_000, p: 100 }, { t: 3_600_000, p: 200 }]
    expect(integrateEnergyKwh(pts)).toBeCloseTo(50 + 75, 9)
    // a 3-hour gap is not integrated
    expect(integrateEnergyKwh([{ t: 0, p: 100 }, { t: 3 * 3_600_000, p: 100 }])).toBe(0)
  })
  it('peak / off-peak', () => {
    const r = peakOffPeak([{ p: 3 }, { p: 9 }, { p: 1 }])!
    expect(r.peakIndex).toBe(1)
    expect(r.offIndex).toBe(2)
  })
})

describe('inverter engine', () => {
  it('reported calculations', () => {
    expect(derived.carrierHz).toBeCloseTo(31372.549, 2)
    expect(derived.fundamentalHz).toBeCloseTo(50.04, 2)
    expect(derived.deadTimeFormulaUs).toBeCloseTo(2.5, 9)
    expect(lcCutoff(250e-6, 1e-6)).toBeCloseTo(10065.84, 1)
    expect(thdFromDbc([-31.2, -31.2, -39.6, -37.4, -48.4, -32.4, -44, -34.4, -45.2])).toBeCloseTo(5.32, 1)
    expect(derived.thdTransformerRecomputed).toBeCloseTo(34.31, 1)
    expect(derived.cg * 1e9).toBeCloseTo(5.575, 2)
    expect(derived.chargeErrorC).toBeCloseTo(9.4e-3, 9)
  })
  it('SPWM bridge is 3-level and never shoots through', () => {
    const s = simulateSpwm({ ...PROTOTYPE_PRESET, fCarrier: 1000, deadTimeUs: 20 }, 0, 0.02, 20000)
    const levels = new Set(s.map((x) => x.vab))
    expect([...levels].every((v) => [12, 0, -12].includes(v))).toBe(true)
    expect(s.every((x) => !(x.q1 && x.q2) && !(x.q3 && x.q4))).toBe(true)
  })
  it('fundamental appears at bin 1 with expected amplitude, sidebands near 2·fc', () => {
    const p = { ...PROTOTYPE_PRESET, fCarrier: 1000, deadTimeUs: 0, m: 0.8 }
    const x = periodBridgeWave(p, 15)
    const mag = rmsSpectrum(x)
    // unipolar-equivalent SPWM: V1,peak = m·Vdc
    expect(mag[1] * Math.SQRT2).toBeCloseTo(0.8 * 12, 0)
    // largest non-fundamental component sits near 2 kHz (bin 40)
    let best = 2
    for (let k = 2; k < 200; k++) if (mag[k] > mag[best]) best = k
    expect(Math.abs(best * 50 - 2000)).toBeLessThanOrEqual(150)
  })
  it('LC filter reduces THD', () => {
    const p = { ...PROTOTYPE_PRESET, deadTimeUs: 0 }
    const x = periodBridgeWave(p, 16)
    const y = filterPeriod(x, p.fRef, 250e-6, 1e-6)
    expect(thdFromSpectrum(rmsSpectrum(y))).toBeLessThan(thdFromSpectrum(rmsSpectrum(x)))
    expect(rms(y)).toBeGreaterThan(0)
  })
  it('coulomb counting and controller table', () => {
    expect(coulombStep(0.5, 1, 3600, 7)).toBeCloseTo(0.5 + 1 / 7, 9)
    expect(coulombStep(0.99, 10, 3600, 7)).toBe(1)
    expect(controllerState(0.4).state).toBe('overdischarged')
    expect(controllerState(0.7).state).toBe('normal')
    expect(controllerState(0.95).switch1).toBe(false)
  })
})
