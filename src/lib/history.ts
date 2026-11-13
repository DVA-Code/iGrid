import { useEffect, useState } from 'react'
import { BRIDGE_HTTP, toReading, type LiveReading, useStore } from './store'

export type HistRange = '24h' | '48h' | '7d' | '30d'
export interface StoredHistory {
  rows: LiveReading[]
  /** ok: data returned · empty: bridge running, nothing stored for this window yet · offline: bridge not reachable */
  state: 'loading' | 'ok' | 'empty' | 'offline'
  coverage: { days: number; first: number | null; last: number | null } | null
}

/** Stored one-minute averages from the bridge (server/data), bucketed for the requested range. Refreshes every minute. */
export function useStoredHistory(sn: string, range: HistRange, opts: { from?: number; to?: number; step?: number } = {}): StoredHistory {
  const bridge = useStore((s) => s.bridge)
  const [out, setOut] = useState<StoredHistory>({ rows: [], state: 'loading', coverage: null })
  const key = `${sn}|${range}|${opts.from ?? ''}|${opts.to ?? ''}|${opts.step ?? ''}`
  useEffect(() => {
    if (bridge !== 'open') { setOut({ rows: [], state: 'offline', coverage: null }); return }
    let alive = true
    setOut({rows:[],state:'loading',coverage:null})
    const load = async () => {
      try {
        const q = new URLSearchParams({ range })
        if (opts.from) q.set('from', String(opts.from))
        if (opts.to) q.set('to', String(opts.to))
        if (opts.step) q.set('step', String(opts.step))
        const res = await fetch(`${BRIDGE_HTTP}/api/history/${sn}?${q}`)
        const j = await res.json() as { rows: Record<string, number>[]; coverage: StoredHistory['coverage'] }
        if(!res.ok) throw new Error('History unavailable')
        const rows = (j.rows ?? []).map(toReading).filter((r):r is LiveReading=>r!==null)
        if (alive) setOut({ rows, state: rows.length ? 'ok' : 'empty', coverage: j.coverage })
      } catch { if (alive) setOut({ rows: [], state: 'offline', coverage: null }) }
    }
    load()
    const id = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, bridge])
  return out
}

export const RANGE_LABEL: Record<HistRange, string> = { '24h': '24 h', '48h': '48 h', '7d': '7 days', '30d': '30 days' }
