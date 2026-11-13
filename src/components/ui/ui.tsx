import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { type ReactNode, useEffect, useId, useMemo, useState } from 'react'
import type { SourceTag } from '@/lib/store'
import { useStore } from '@/lib/store'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

/* ---------------- Source badge ---------------- */
const TAG_STYLE: Record<SourceTag, { cls: string; hint: string }> = {
  LIVE: { cls: 'bg-ok/10 text-ok border-ok/30', hint: 'Fresh reading from a real meter' },
  CONNECTING: { cls: 'bg-brand/10 text-brand border-brand/30', hint: 'Connecting to the telemetry service' },
  STALE: { cls: 'bg-warn/10 text-warn border-warn/35', hint: 'Last reading is older than the threshold; values frozen' },
  DISCONNECTED: { cls: 'bg-bad/10 text-bad border-bad/30', hint: 'Telemetry connection unavailable; meter condition unverified' },
  REPLAY: { cls: 'bg-pc/10 text-pc border-pc/30', hint: 'Historical playback' },
  DEMO: { cls: 'bg-sun/10 text-sun border-sun/35', hint: 'Synthetic demonstration data, not a measurement' },
  REPORTED: { cls: 'bg-s2 text-ink2 border-[rgb(var(--line)/0.18)]', hint: 'Value published in the research report' },
  CALCULATED: { cls: 'bg-navy/10 text-navy border-navy/25', hint: 'Derived by a documented equation' },
  SIMULATED: { cls: 'bg-leaf/10 text-leaf border-leaf/30', hint: 'Output of a simulation' },
  'NOT AVAILABLE': { cls: 'bg-s2 text-ink3 border-[rgb(var(--line)/0.15)]', hint: 'No supporting data' },
}

export function SourceBadge({ tag, className, title }: { tag: SourceTag; className?: string; title?: string }) {
  const s = TAG_STYLE[tag]
  return (
    <span title={title ?? s.hint} className={cx('inline-flex shrink-0 items-center gap-1 rounded-sm border px-1.5 py-[2px] text-[10.5px] font-semibold tracking-[0.04em]', s.cls, className)}>
      {tag === 'LIVE' && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {tag}
    </span>
  )
}

/* ---------------- Animated number ---------------- */
export function AnimatedNumber({ value, digits = 1, className, suffix }: { value: number; digits?: number; className?: string; suffix?: ReactNode }) {
  const reduced = useStore((s) => s.reducedMotion)
  const mv = useMotionValue(value)
  const text = useTransform(mv, (v) => (Number.isFinite(v) ? v.toFixed(digits) : '—'))
  const [flash, setFlash] = useState(0)
  useEffect(() => {
    if (reduced || !Number.isFinite(value)) { mv.set(value); return }
    const c = animate(mv, value, { duration: 0.7, ease: [0.22, 1, 0.36, 1] })
    setFlash((f) => f + 1)
    return () => c.stop()
  }, [value, reduced, mv])
  return (
    <span className={cx('num relative', className)}>
      <motion.span key={flash} initial={{ opacity: 0.55 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
        <motion.span>{text}</motion.span>
      </motion.span>
      {suffix}
    </span>
  )
}

/* ---------------- Value with unit ---------------- */
export function Value({ v, unit, digits = 1, size = 'md', className }: { v: number | null | undefined; unit?: string; digits?: number; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const sz = { sm: 'text-[15px]', md: 'text-[20px]', lg: 'text-[28px]', xl: 'text-[44px] md:text-[56px] leading-none tracking-[-0.02em]' }[size]
  const usz = { sm: 'text-[11px]', md: 'text-[12px]', lg: 'text-[14px]', xl: 'text-[16px]' }[size]
  return (
    <span className={cx('inline-flex items-baseline gap-1 font-medium text-ink', sz, className)}>
      {v === null || v === undefined || !Number.isFinite(v) ? <span className="text-ink3">—</span> : <AnimatedNumber value={v} digits={digits} />}
      {unit && <span className={cx('font-normal text-ink3', usz)}>{unit}</span>}
    </span>
  )
}

export function Stat({ label, v, unit, digits, tag, hint, size = 'md' }: { label: string; v: number | null | undefined; unit?: string; digits?: number; tag?: SourceTag; hint?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="min-w-0 text-[12px] leading-snug text-ink2">{label}</span>
        {tag && <SourceBadge tag={tag} />}
      </div>
      <Value v={v} unit={unit} digits={digits} size={size} />
      {hint && <div className="mt-1 text-[12px] text-ink3">{hint}</div>}
    </div>
  )
}

/* ---------------- Card / section ---------------- */
export function Card({ children, className, pad = true, as = 'section' }: { children: ReactNode; className?: string; pad?: boolean; as?: 'section' | 'div' }) {
  const C = as
  return <C className={cx('surface min-w-0 rounded-lg', pad && 'p-5 md:p-6', className)}>{children}</C>
}

export function CardHead({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {sub && <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink3">{sub}</p>}
      </div>
      {right && <div className="flex max-w-full flex-wrap items-center gap-2">{right}</div>}
    </div>
  )
}

export function PageIntro({ eyebrow, title, children, right }: { eyebrow: string; title: string; children?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4 md:mb-6">
      <div className="max-w-3xl">
        <div className="mb-1 text-[12px] font-medium text-ink3">{eyebrow}</div>
        <h2 className="font-serif text-[21px] font-semibold text-ink md:text-[24px]">{title}</h2>
        {children && <p className="mt-1.5 text-[14px] leading-relaxed text-ink2">{children}</p>}
      </div>
      {right}
    </div>
  )
}

/* ---------------- Segmented control ---------------- */
export function Segmented<T extends string>({ value, onChange, options, size = 'md', className, label }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; size?: 'sm' | 'md'; className?: string; label?: string
}) {
  const id = useId()
  return (
    <div role="tablist" aria-label={label} className={cx('no-scrollbar relative inline-flex max-w-full overflow-x-auto rounded-md border hair bg-s1 p-[2px]', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'focus-ring relative z-0 shrink-0 whitespace-nowrap rounded-sm font-medium transition-colors duration-200',
              size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3.5 py-1.5 text-[13px]',
              active ? 'text-onnavy' : 'text-ink2 hover:text-ink',
            )}
          >
            {active && (
              <motion.span layoutId={`seg-${id}`} className="absolute inset-0 -z-10 rounded-sm bg-navy" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
            )}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ---------------- Equation ---------------- */
export function Eq({ tex, display = true, className }: { tex: string; display?: boolean; className?: string }) {
  const html = useMemo(() => katex.renderToString(tex, { displayMode: display, throwOnError: false, strict: false, trust: false }), [tex, display])
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

/* ---------------- Disclosure ---------------- */
export function Disclosure({ title, children, defaultOpen = false }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="hair-t">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="focus-ring flex w-full items-center justify-between py-3 text-left text-[13px] font-medium text-ink2 hover:text-ink">
        {title}
        <motion.svg animate={{ rotate: open ? 180 : 0 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></motion.svg>
      </button>
      <motion.div initial={false} animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
        <div className="pb-4 text-[13px] leading-relaxed text-ink2">{children}</div>
      </motion.div>
    </div>
  )
}

/* ---------------- Slider ---------------- */
export function Slider({ label, value, min, max, step, unit, onChange, digits = 1 }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void; digits?: number }) {
  const id = useId()
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[12px] text-ink2">{label}</label>
        <span className="num text-[12px] font-medium text-ink">{value.toFixed(digits)}{unit && <span className="ml-0.5 text-ink3">{unit}</span>}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}

/* ---------------- Notes / callouts ---------------- */
export function Note({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'warn' | 'info'; className?: string }) {
  const tones = { neutral: 'border-[rgb(var(--line)/0.15)] bg-s2', warn: 'border-warn/30 bg-warn/[0.07]', info: 'border-brand/25 bg-brand/[0.06]' }
  return <div className={cx('rounded-md border px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink2', tones[tone], className)}>{children}</div>
}

export function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="divide-y divide-[rgb(var(--line)/var(--line-a))]">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 py-2 text-[13px]">
          <dt className="text-ink2">{k}</dt>
          <dd className="num text-right font-medium text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Table({ head, rows, className }: { head: ReactNode[]; rows: ReactNode[][]; className?: string }) {
  return (
    <div className={cx('no-scrollbar overflow-x-auto', className)}>
      <table className="w-full min-w-[420px] border-collapse text-[13px]">
        <thead>
          <tr>{head.map((h, i) => <th key={i} className={cx('hair-b py-2 pr-4 font-medium text-ink3', i === 0 ? 'text-left' : 'text-right')}>{h}</th>)}</tr>
        </thead>
        <tbody className="num">
          {rows.map((r, i) => (
            <tr key={i} className="hair-b last:border-0">
              {r.map((c, j) => <td key={j} className={cx('py-2.5 pr-4', j === 0 ? 'text-left text-ink2' : 'text-right text-ink')}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export const PHASE_COLOR = { a: 'rgb(var(--pa))', b: 'rgb(var(--pb))', c: 'rgb(var(--pc))' } as const
export const PHASE_LABEL = { a: 'Phase A', b: 'Phase B', c: 'Phase C' } as const

export function PhaseDot({ p, className }: { p: 'a' | 'b' | 'c'; className?: string }) {
  return <span className={cx('inline-block h-2 w-2 rounded-full', className)} style={{ background: PHASE_COLOR[p] }} aria-hidden />
}

export function fmtTime(t: number, withDate = false) {
  const d = new Date(t)
  const time = d.toLocaleTimeString('en-GB', { timeZone:'Asia/Kathmandu', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  if (!withDate) return time
  return `${d.toLocaleDateString('en-GB', { timeZone:'Asia/Kathmandu',day: '2-digit', month: 'short', year: 'numeric' })} · ${time}`
}

export function Reveal({ children, className }: { children: ReactNode; delay?: number; className?: string }) {
  return <div className={className}>{children}</div>
}
