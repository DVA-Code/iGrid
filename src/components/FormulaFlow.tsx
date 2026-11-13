import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { SourceTag } from '@/lib/store'
import { useStore } from '@/lib/store'
import { Card, cx, Eq, SourceBadge } from './ui/ui'

export interface FlowItem { label: string; tex?: string; sub?: string; value?: ReactNode }
export interface FlowStage { id: string; title: string; explain: string; items: FlowItem[]; extra?: ReactNode }

const STEP_MS = 650

/**
 * Animated calculation pipeline. When `pulseKey` changes (a new meter reading), a pulse travels
 * stage by stage; each stage switches to the new numbers only when the pulse reaches it, so the
 * viewer sees each formula take its inputs from the previous step.
 */
export function FormulaFlow<T>({ data, pulseKey, build, tag, title = 'Calculation path', vertical = false, instant = false, right, hint = 'Animates on every new reading' }: {
  data: T; pulseKey: number | string; build: (d: T) => FlowStage[]; tag: SourceTag; title?: string
  /** stages stacked top to bottom (long design procedures) */
  vertical?: boolean
  /** show new values immediately; the pulse only highlights each stage in turn */
  instant?: boolean
  right?: ReactNode
  hint?: string
}) {
  const reduced = useStore((s) => s.reducedMotion)
  const initial = build(data)
  const [snap, setSnap] = useState<FlowStage[]>(initial)
  const [active, setActive] = useState(-1)
  const [pulse, setPulse] = useState(0)
  const [guided, setGuided] = useState<number | null>(null)
  const timers = useRef<number[]>([])
  const latest = useRef(data)
  latest.current = data

  useEffect(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    const next = build(latest.current)
    if (reduced) { setSnap(next); setActive(-1); return }
    setPulse((p) => p + 1)
    next.forEach((st, i) => {
      timers.current.push(window.setTimeout(() => {
        setSnap((cur) => { const c = cur.length === next.length ? [...cur] : [...next]; c[i] = st; return c })
        setActive(i)
      }, i * STEP_MS))
    })
    timers.current.push(window.setTimeout(() => setActive(-1), next.length * STEP_MS + 400))
    return () => timers.current.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseKey, reduced])

  // keep structure in sync if stage count changes
  const stages = instant ? initial : snap.length === initial.length ? snap : initial
  const focus = guided ?? active

  return (
    <Card pad={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 hair-b px-5 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-semibold">{title}</h3>
          <SourceBadge tag={tag} />
          {right}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="mr-1 hidden text-[12px] text-ink3 sm:inline">{guided === null ? hint : `Step ${guided + 1} of ${stages.length}`}</span>
          <button onClick={() => setGuided((g) => (g === null ? 0 : Math.max(0, g - 1)))} className="focus-ring rounded-sm border hair px-2.5 py-1 text-[12px] font-medium hover:bg-s2" aria-label="Previous step">{guided === null ? 'Step through' : '‹ Back'}</button>
          {guided !== null && (
            <>
              <button onClick={() => setGuided((g) => (g! < stages.length - 1 ? g! + 1 : g))} className="focus-ring rounded-sm border hair px-2.5 py-1 text-[12px] font-medium hover:bg-s2" aria-label="Next step">Next ›</button>
              <button onClick={() => setGuided(null)} className="focus-ring rounded-sm px-2 py-1 text-[12px] text-ink3 hover:text-ink">Done</button>
            </>
          )}
        </div>
      </div>
      <div className={cx('grid gap-y-9 p-4 md:p-6', !vertical && 'xl:grid-cols-[repeat(var(--n),minmax(0,1fr))] xl:gap-x-10')} style={{ ['--n' as string]: stages.length }}>
        {stages.map((st, i) => {
          const on = focus === i
          const dim = guided !== null && guided !== i
          const main = st.items.find((it) => it.value !== undefined) ?? st.items[0]
          return (
            <div key={st.id} className="relative">
              {i > 0 && <FlowArrow moving={active === i} pulse={pulse} vertical={vertical} />}
              <div className={cx('flex h-full flex-col rounded-lg border p-4 transition-all duration-300', on ? 'border-brand/70 bg-brand/[0.045] shadow-[0_0_0_4px_rgb(var(--brand)/0.10)]' : 'hair bg-s1', dim && 'opacity-40')}>
                <div className="flex items-center gap-2">
                  <span className={cx('num grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11.5px] font-semibold transition-colors', on ? 'bg-brand text-onnavy' : 'bg-s2 text-ink2')}>{i + 1}</span>
                  <span className="text-[13.5px] font-semibold text-ink">{st.title}</span>
                </div>
                {vertical && <p className="mt-1 text-[12.5px] leading-relaxed text-ink3">{st.explain}</p>}
                <div className={cx('mt-3', vertical ? 'grid gap-3 md:grid-cols-2 xl:grid-cols-3' : 'space-y-3')}>
                  {st.items.map((it, k) => (
                    <div key={k} className="min-w-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <span className="whitespace-nowrap text-[12px] text-ink2">{it.label}</span>
                        {it.value !== undefined && <span className={cx('num whitespace-nowrap font-semibold transition-colors duration-500', it === main ? 'text-[16px]' : 'text-[13.5px]', on ? 'text-brand' : 'text-ink')}>{it.value}</span>}
                      </div>
                      {it.tex && <div className="mt-1.5 overflow-x-auto rounded-md bg-s2/70 px-3 py-2 text-[14px] text-ink"><Eq tex={big(it.tex)} /></div>}
                      {it.sub && (vertical || on || guided === i) && <div className="mt-1 overflow-x-auto px-1 text-[12px] text-ink2"><Eq tex={it.sub} /></div>}
                    </div>
                  ))}
                  {st.extra}
                </div>
                {!vertical && <p className={cx('mt-auto pt-3 text-[12px] leading-relaxed text-ink3 transition-opacity', on || guided === i ? 'opacity-100' : 'opacity-0 xl:h-0 xl:overflow-hidden xl:pt-0 max-xl:hidden')}>{st.explain}</p>}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/** Formulas read at display size: inline fractions are too small to scan. */
const big = (tex: string) => tex.replace(/\\tfrac/g, '\\dfrac').replace(/\\frac/g, '\\dfrac')

/** Arrow between two stages: down on narrow screens, right on wide ones. A dot runs along it when data moves. */
function FlowArrow({ moving, pulse, vertical }: { moving: boolean; pulse: number; vertical?: boolean }) {
  return (
    <div aria-hidden className={cx('pointer-events-none absolute left-1/2 top-[-30px] h-[24px] w-[24px] -translate-x-1/2', !vertical && 'xl:left-[-34px] xl:top-1/2 xl:h-[24px] xl:w-[28px] xl:translate-x-0 xl:-translate-y-1/2')}>
      <svg viewBox="0 0 28 24" className={cx('h-full w-full rotate-90', !vertical && 'xl:rotate-0')} fill="none">
        <path d="M2 12 H22" stroke="rgb(var(--line) / 0.35)" strokeWidth="2" strokeLinecap="round" />
        <path d="M17 6 L24 12 L17 18" stroke={moving ? 'rgb(var(--brand))' : 'rgb(var(--line) / 0.45)'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'stroke .3s' }} />
        {moving && <circle key={pulse} r="3" cy="12" fill="rgb(var(--brand))"><animate attributeName="cx" from="2" to="22" dur={`${STEP_MS}ms`} fill="freeze" /></circle>}
      </svg>
    </div>
  )
}
