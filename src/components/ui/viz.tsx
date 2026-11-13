import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef } from 'react'
import { TSI_CATEGORIES } from '@/lib/models/thermal'
import { PROTOTYPE_PRESET, tri } from '@/lib/models/inverter'
import { useStore } from '@/lib/store'
import { cx } from './ui'

/** Five-band TSI scale with an animated marker. Raw value outside 0–1 pins to the edge with an arrow. */
export function TsiScale({ value, compact = false }: { value: number; compact?: boolean }) {
  const pos = Math.min(1, Math.max(0, value))
  const out = value < 0 || value > 1
  return (
    <div>
      <div className="relative">
        <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-full">
          {TSI_CATEGORIES.map((c) => <div key={c.id} className="flex-1" style={{ background: c.color, opacity: 0.88 }} />)}
        </div>
        <motion.div className="absolute -top-[5px]" initial={false} animate={{ left: `${pos * 100}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} style={{ x: '-50%' }}>
          <div className="h-5 w-[3px] rounded-full bg-ink shadow-[0_0_0_3px_rgb(var(--s1))]" />
        </motion.div>
      </div>
      {!compact && (
        <div className="mt-2 grid grid-cols-5 text-[10.5px] text-ink3">
          {TSI_CATEGORIES.map((c) => <span key={c.id} className="truncate">{c.label}</span>)}
        </div>
      )}
      {out && <div className="mt-1.5 text-[11px] text-[#E2C044]">Raw value {value.toFixed(3)} is outside the model's 0–1 reference range</div>}
    </div>
  )
}

export function Sparkline({ data, color = 'rgb(var(--ink2))', height = 36, className, fill = true, domain }: { data: number[]; color?: string; height?: number; className?: string; fill?: boolean; domain?: [number, number] }) {
  const { d, area } = useMemo(() => {
    if (data.length < 2) return { d: '', area: '' }
    const lo = domain ? domain[0] : Math.min(...data)
    const hi = domain ? domain[1] : Math.max(...data)
    const span = hi - lo || 1
    const pts = data.map((v, i) => [(i / (data.length - 1)) * 100, 100 - ((v - lo) / span) * 92 - 4])
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join('')
    return { d, area: `${d}L100,100L0,100Z` }
  }, [data, domain])
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={cx('w-full overflow-visible', className)} style={{ height }} aria-hidden>
      {fill && <path d={area} fill={color} opacity={0.1} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

/** Animated SPWM illustration: sine reference, carrier and pulses morphing into a filtered sine. Pure maths. */
export function SpwmIllustration({ className, height = 180 }: { className?: string; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduced = useStore((s) => s.reducedMotion)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')!
    let raf = 0, t0 = performance.now()
    const css = getComputedStyle(document.documentElement)
    const col = (v: string, a = 1) => `rgba(${css.getPropertyValue(v).trim().split(' ').join(',')},${a})`
    const draw = (now: number) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = cv.clientWidth, h = cv.clientHeight
      if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const phase = reduced ? 0 : ((now - t0) / 4000) % 1
      const fc = 21 // illustrative carrier ratio
      const m = PROTOTYPE_PRESET.m * 0.95
      const mid = h * 0.5, amp = h * 0.36
      const morph = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2) // 0..1..0
      // carrier
      ctx.strokeStyle = col('--ink3', 0.35 * (1 - morph)); ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = 0; x <= w; x += 1) { const u = x / w; const y = mid - tri(u, fc) * amp; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y) }
      ctx.stroke()
      // pulses (bridge output, 3-level)
      ctx.fillStyle = col('--sun', 0.22 * (1 - morph) + 0.04)
      for (let x = 0; x < w; x += 1) {
        const u = x / w
        const s = m * Math.sin(2 * Math.PI * u)
        const a = s > tri(u, fc) ? 1 : 0, b = -s > tri(u, fc) ? 1 : 0
        const v = a - b
        if (v !== 0) ctx.fillRect(x, v > 0 ? mid - amp : mid, 1, amp)
      }
      // reference / filtered sine
      ctx.strokeStyle = col('--sun', 0.95); ctx.lineWidth = 2
      ctx.beginPath()
      for (let x = 0; x <= w; x += 1) { const u = x / w; const y = mid - m * Math.sin(2 * Math.PI * u) * amp; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y) }
      ctx.stroke()
      ctx.strokeStyle = col('--line', 0.12); ctx.lineWidth = 1
      ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke()
      if (!reduced) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [reduced])
  return <canvas ref={ref} className={cx('w-full', className)} style={{ height }} aria-label="Sinusoidal PWM illustration: a sine reference compared with a triangle carrier produces pulses that filter back to a sine" role="img" />
}
