import { describe, expect, it } from 'vitest'
import { BUSES, downstream, forecastNextHours, inferState, LINES, METER_BUS, pathToRoot } from './grid'

const r = { t: 0, va: 232, vb: 231, vc: 233, ia: 50, ib: 55, ic: 48, pfa: 0.9, pfb: 0.9, pfc: 0.9 }

describe('grid topology', () => {
  it('every line connects known buses and every meter bus is on the network', () => {
    const ids = new Set(BUSES.map((b) => b.id))
    expect(LINES.every((l) => ids.has(l.from) && ids.has(l.to))).toBe(true)
    expect(METER_BUS.every((m) => ids.has(m.bus))).toBe(true)
  })
  it('radial tree: every metered building traces back to the transformer', () => {
    for (const m of METER_BUS.filter((x) => x.bus !== 1)) {
      const path = pathToRoot(m.bus)
      expect(path[path.length - 1].from).toBe(0)
    }
    expect(downstream(1).length).toBe(BUSES.length - 1)
  })
})

describe('meter state inference', () => {
  it('normal, stale, no data and demo', () => {
    expect(inferState(r, { live: true, ageMs: 5000 })).toBe('live')
    expect(inferState(r, { live: true, ageMs: 200_000 })).toBe('stale')
    expect(inferState(null, { live: true, ageMs: 0 })).toBe('nodata')
    expect(inferState(r, { live: false, ageMs: 0 })).toBe('demo')
  })
  it('outage, phase loss and overload', () => {
    expect(inferState({ ...r, va: 0, vb: 1, vc: 0 }, { live: true, ageMs: 0 })).toBe('outage')
    expect(inferState({ ...r, vc: 0 }, { live: true, ageMs: 0 })).toBe('phase-loss')
    expect(inferState({ ...r, ia: 400, ib: 400, ic: 400 }, { live: true, ageMs: 0, ratedKva: 200 })).toBe('overload')
  })
})

describe('forecast', () => {
  it('does not fabricate a forecast when history is short', () => {
    const f = forecastNextHours([], { t: Date.now(), p: 50 }, 3)
    expect(f.points).toHaveLength(0)
    expect(f.basis).toMatch(/Insufficient stored history/)
  })
  it('uses seasonal-naive with a day or more of history', () => {
    const now = Date.now()
    const hist = Array.from({ length: 30 * 4 }, (_, k) => ({ t: now - (30 * 4 - k) * 900_000, p: 40 }))
    const f = forecastNextHours(hist, { t: now, p: 80 }, 2)
    expect(f.basis).toMatch(/Seasonal-naive/)
    expect(f.points.every((x) => Math.abs(x.p - 80) < 1e-6)).toBe(true)
  })
})
