import { useMemo } from 'react'
import { computeEnergy } from './models/energy'
import { categoryMeta, computeThermal } from './models/thermal'
import { feedStatus, MAIN_SN, meterReading, meterStatus, useStore } from './store'

/** Latest meter reading with both project calculations applied (same reading, separate science). */
export function useLive(kind: 'thermal' | 'energy' = 'thermal') {
  const sn = useStore((s) => (kind === 'energy' ? s.energyMeter : MAIN_SN))
  const st = useStore()
  const src = useMemo(() => meterReading(st, sn), [st.latest, st.meters, st.history, st.adapter, sn])
  const latest = src.latest, receivedAt = src.receivedAt, history = src.history
  const status = sn === MAIN_SN ? feedStatus(st) : meterStatus(st, sn)
  const thermal = useMemo(() => computeThermal(latest), [latest])
  const energy = useMemo(() => computeEnergy(latest), [latest])
  const last = history[history.length - 1]
  const prev = last && last.t < latest.t ? last : history.length > 1 ? history[history.length - 2] : null
  const prevThermal = useMemo(() => (prev ? computeThermal(prev) : null), [prev])
  const cat = categoryMeta(thermal.category)
  const live = status === 'LIVE' || status === 'DEMO'
  return { latest, receivedAt, history, status, thermal, energy, prevThermal, cat, live, sn }
}
