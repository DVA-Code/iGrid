import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { METERS, meterReading, meterStatus, useStore } from '@/lib/store'
import { Icon, type IconName } from './ui/symbols'
import { Card, CardHead, cx, SourceBadge } from './ui/ui'

const OsiStack = lazy(() => import('./three/OsiStack').then((m) => ({ default: m.OsiStack })))

const NODES: { id: string; icon: IconName; title: string; detail: string }[] = [
  { id: 'src', icon: 'electrical_services', title: 'Supply', detail: 'Transformer or building feeder; CTs clamp each phase' },
  { id: 'meter', icon: 'electric_meter', title: 'IAMMETER WEM3080T', detail: 'Samples V, I, P, PF per phase' },
  { id: 'wifi', icon: 'router', title: 'Wi-Fi router', detail: 'Network route shown conceptually' },
  { id: 'broker', icon: 'cloud', title: 'MQTT broker', detail: 'mqtt.iammeter.com · topic device/<SN>/realtime' },
  { id: 'bridge', icon: 'dns', title: 'GML bridge', detail: 'Validates, identifies the building, computes' },
  { id: 'dash', icon: 'monitor', title: 'Dashboard', detail: 'WebSocket or stored-data HTTP updates' },
]

/** Smart-meter → dashboard path, animated once per received reading. */
export function DataPath({ sn }: { sn: string }) {
  const st = useStore()
  const meter = METERS.find((m) => m.sn === sn)!
  const src = meterReading(st, sn)
  const status = meterStatus(st, sn)
  const reduced = st.reducedMotion
  const [step, setStep] = useState(-1)
  const [transportOpen,setTransportOpen]=useState(false)
  const lastT = useRef(0)
  useEffect(() => {
    const t = src.latest.t
    if (!t || t === lastT.current || !['LIVE','DEMO'].includes(status)) return
    lastT.current = t
    if (reduced) return
    const ids: number[] = []
    NODES.forEach((_, i) => ids.push(window.setTimeout(() => setStep(i), i * 380)))
    ids.push(window.setTimeout(() => setStep(-1), NODES.length * 380 + 500))
    return () => ids.forEach(clearTimeout)
  }, [src.latest.t, reduced,status])

  return (
    <div className="space-y-5">
      <Card>
        <CardHead title="From meter to dashboard" sub={meter.name} right={<SourceBadge tag={status} />} />
        <ol className="relative grid gap-3 md:grid-cols-6 md:gap-0">
          {NODES.map((n, i) => {
            const on = step === i
            const passed = step > i
            return (
              <li key={n.id} className="relative flex items-start gap-3 md:flex-col md:items-center md:px-2 md:text-center">
                {i < NODES.length - 1 && (
                  <span className="absolute left-[21px] top-11 h-[calc(100%-20px)] w-[2px] bg-[rgb(var(--line)/0.14)] md:left-[calc(50%+26px)] md:top-[22px] md:h-[2px] md:w-[calc(100%-52px)]" aria-hidden>
                    <span className={cx('absolute inset-0 origin-top bg-brand transition-transform duration-300 md:origin-left', passed ? 'scale-100' : 'scale-0')} />
                  </span>
                )}
                <span className={cx('relative z-10 grid h-11 w-11 shrink-0 place-items-center rounded-md border transition-all duration-300', on ? 'border-brand bg-brand text-onnavy shadow-[0_0_0_5px_rgb(var(--brand)/0.15)]' : passed ? 'border-brand/50 bg-brand/10 text-brand' : 'hair bg-s1 text-ink2')}>
                  <Icon name={n.icon} size={22} />
                </span>
                <span className="min-w-0 md:mt-2.5">
                  <span className="block text-[13px] font-semibold">{n.title}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-ink3">{n.detail}</span>
                </span>
              </li>
            )
          })}
        </ol>
      </Card>

      <details className="surface rounded p-4" onToggle={e=>setTransportOpen(e.currentTarget.open)}><summary className="cursor-pointer">Explore the TCP/IP transport model in 3D</summary><Card pad={false} className="overflow-hidden">
        <div className="hair-b px-5 py-3.5">
          <h3 className="text-[15px] font-semibold">TCP/IP model of one reading</h3>
          <p className="mt-0.5 text-[12.5px] text-ink3">Headers are added at the meter, read at the broker and removed at the lab server. Conceptual animation, not a packet capture. Drag to rotate.</p>
        </div>
        <Suspense fallback={<div className="h-[420px] animate-pulse bg-s2" />}>{transportOpen&&<OsiStack />}</Suspense>
      </Card></details>
    </div>
  )
}
