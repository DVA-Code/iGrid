import { useEffect, useMemo, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { SourceBadge } from '@/components/ui/ui'
import { Sparkline, TsiScale } from '@/components/ui/viz'
import { computeEnergy } from '@/lib/models/energy'
import { INVERTER_REPORTED } from '@/lib/models/inverter'
import { computeThermal } from '@/lib/models/thermal'
import { projectById } from '@/lib/projects.config'
import { useStore } from '@/lib/store'
import { useLive } from '@/lib/useLive'

/** Chrome-less widget for <iframe> embedding on the lab website: /#/embed/thermal?theme=light */
export default function Embed() {
  const { project = 'thermal' } = useParams()
  const p = projectById(project) ?? projectById('thermal')!
  const setTheme = useStore((s) => s.setTheme)
  const ref = useRef<HTMLDivElement>(null)
  const { thermal, energy, cat, history, status } = useLive()
  useEffect(() => {
    const th = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('theme')
    if (th === 'light' || th === 'dark') setTheme(th)
  }, [setTheme])
  useEffect(() => {
    const post = () => window.parent?.postMessage({ type: 'gml-embed-height', project: p.id, height: ref.current?.scrollHeight ?? 0 }, '*')
    post()
    const ro = new ResizeObserver(post)
    if (ref.current) ro.observe(ref.current)
    return () => ro.disconnect()
  }, [p.id])
  const series = useMemo(() => history.map((r) => (p.id === 'energy' ? computeEnergy(r).pKw : computeThermal(r).tsiRaw)), [history, p.id])
  const full = `${window.location.origin}${window.location.pathname}#${p.route}`
  return (
    <div ref={ref} className="min-h-0 bg-bg p-4 text-ink">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-semibold">{p.concept}</div>
        <SourceBadge tag={p.id === 'inverter' ? 'REPORTED' : status} />
      </div>
      {p.id === 'thermal' && (<>
        <div className="mt-2 flex items-baseline gap-2"><span className="num text-[32px] font-semibold">{thermal.tsiRaw.toFixed(2)}</span><span className="font-medium" style={{ color: cat.color }}>{cat.label}</span></div>
        <div className="mt-3"><TsiScale value={thermal.tsiRaw} compact /></div>
        <Sparkline data={series} color={cat.color} height={40} domain={[0, 1]} className="mt-3" />
      </>)}
      {p.id === 'energy' && (<>
        <div className="mt-2 flex items-baseline gap-2"><span className="num text-[32px] font-semibold">{energy.pKw.toFixed(0)}</span><span className="text-ink3">kW</span><span className="ml-auto num text-[13px] text-ink2">CUF {energy.cuf?.toFixed(1)} %</span></div>
        <Sparkline data={series} color="rgb(var(--teal))" height={48} className="mt-3" />
      </>)}
      {p.id === 'inverter' && (
        <div className="mt-3 grid grid-cols-3 gap-3 text-[12px]">
          <div><div className="text-ink3">No load</div><div className="num text-[20px] font-semibold">{R(INVERTER_REPORTED.noLoadV)} V</div></div>
          <div><div className="text-ink3">1 kΩ load</div><div className="num text-[20px] font-semibold">{INVERTER_REPORTED.loadedV} V</div></div>
          <div><div className="text-ink3">Filter THD</div><div className="num text-[20px] font-semibold">{INVERTER_REPORTED.thdFilter} %</div></div>
        </div>
      )}
      <a href={full} target="_blank" rel="noreferrer" className="mt-3 inline-block text-[12.5px] font-medium text-steel hover:underline">Open full dashboard ↗</a>
      <div className="mt-1 text-[10.5px] text-ink3">Grid Modernization Laboratory · Kathmandu University</div>
    </div>
  )
}
const R = (v: number) => v
