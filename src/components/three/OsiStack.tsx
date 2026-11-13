import { Html, Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { cx } from '@/components/ui/ui'
import { useStore } from '@/lib/store'

/**
 * TCP/IP model of one IAMMETER reading: meter → broker (mqtt.iammeter.com) → GML bridge / dashboard.
 * The packet goes down the meter's stack (headers added), across the network, up to the broker's
 * application layer (MQTT routing), back down, across, and up the server stack (headers removed).
 */
const LAYERS = [
  { n: 4, name: 'Application', short: 'MQTT', meter: 'Reading → JSON "Datas" → MQTT PUBLISH', broker: 'Routes readings to the authenticated collector', server: 'Bridge receives, validates, pushes to browsers', color: '#4c9f4f' },
  { n: 3, name: 'Transport', short: 'TCP', meter: 'TCP segment to port 1883', broker: 'TCP session per client', server: 'TCP reassembles the stream', color: '#2e8b7a' },
  { n: 2, name: 'Internet', short: 'IP', meter: 'IP packet addressed to the broker', broker: 'IP routing in and out', server: 'IP delivers to the lab PC', color: '#2a6ca6' },
  { n: 1, name: 'Network access', short: 'Frame', meter: 'Wi-Fi 802.11 frame (2.4 GHz)', broker: 'Data-centre Ethernet', server: 'Campus Ethernet / Wi-Fi', color: '#28466a' },
]
const NODES = [
  { id: 'meter', label: 'Smart meter', sub: 'IAMMETER WEM3080T', x: -4.3 },
  { id: 'broker', label: 'MQTT broker', sub: 'mqtt.iammeter.com', x: 0 },
  { id: 'server', label: 'Lab server', sub: 'GML bridge + dashboard', x: 4.3 },
] as const
type NodeId = typeof NODES[number]['id']

const STEP = 0.75, LINK = 1.4
type Seg = { kind: 'down' | 'up'; node: NodeId; dur: number } | { kind: 'link'; from: NodeId; to: NodeId; dur: number }
const SEGS: Seg[] = [
  { kind: 'down', node: 'meter', dur: 4 * STEP },
  { kind: 'link', from: 'meter', to: 'broker', dur: LINK },
  { kind: 'up', node: 'broker', dur: 4 * STEP },
  { kind: 'down', node: 'broker', dur: 4 * STEP },
  { kind: 'link', from: 'broker', to: 'server', dur: LINK },
  { kind: 'up', node: 'server', dur: 4 * STEP },
]
const TOTAL = SEGS.reduce((a, s) => a + s.dur, 0) + 1.2 // short pause at the end

const yOf = (n: number) => (n - 1) * 0.62
const xOf = (id: NodeId) => NODES.find((n) => n.id === id)!.x

export interface StackStep { node: NodeId | 'link'; layer: number; dir: 'down' | 'up' | 'link' | 'idle'; headers: number; text: string }

function stepAt(t: number): StackStep & { pos: THREE.Vector3 } {
  let acc = 0
  for (const s of SEGS) {
    if (t < acc + s.dur) {
      const f = (t - acc) / s.dur
      if (s.kind === 'link') {
        const a = xOf(s.from), b = xOf(s.to)
        const x = a + (b - a) * f
        const y = yOf(1) - 0.55 - Math.sin(f * Math.PI) * 0.45
        return { node: 'link', layer: 0, dir: 'link', headers: 4, text: `Bits travel ${s.from === 'meter' ? 'from the meter over Wi-Fi and the internet to the broker' : 'from the broker over the internet to the lab server'}`, pos: new THREE.Vector3(x, y, 1.15) }
      }
      const k = Math.min(3, Math.floor(f * 4)) // 0..3
      const local = f * 4 - k
      const layer = s.kind === 'down' ? 4 - k : 1 + k
      const y0 = s.kind === 'down' ? yOf(layer) + 0.3 : yOf(layer) - 0.3
      const y = s.kind === 'down' ? y0 - local * 0.6 : y0 + local * 0.6
      const L = LAYERS[4 - layer]
      const headers = s.kind === 'down' ? 5 - layer : layer === 4 ? 0 : 4 - layer
      const role = s.node === 'meter' ? L.meter : s.node === 'broker' ? L.broker : L.server
      const verb = s.kind === 'down' ? `adds ${L.short} header` : `removes ${L.short} header`
      return { node: s.node, layer, dir: s.kind, headers, text: `${NODES.find((n) => n.id === s.node)!.label} · ${L.name}: ${role} (${verb})`, pos: new THREE.Vector3(xOf(s.node), y, 1.15) }
    }
    acc += s.dur
  }
  return { node: 'server', layer: 4, dir: 'idle', headers: 0, text: 'Reading delivered to the dashboard', pos: new THREE.Vector3(xOf('server'), yOf(4) + 0.45, 1.15) }
}

function Stack({ x, active, label, sub, narrow }: { x: number; active: number; label: string; sub: string; narrow: boolean }) {
  return (
    <group position={[x, 0, 0]}>
      {LAYERS.map((l) => {
        const w = 3.2 - (l.n - 1) * 0.36
        const on = active === l.n
        return (
          <group key={l.n} position={[0, yOf(l.n), 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[w, 0.5, 1.9]} />
              <meshStandardMaterial color={l.color} emissive={l.color} emissiveIntensity={on ? 0.55 : 0.06} roughness={0.45} metalness={0.15} />
            </mesh>
            <mesh position={[0, 0.252, 0]}>
              <boxGeometry args={[w - 0.04, 0.006, 1.86]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={on ? 0.35 : 0.08} />
            </mesh>
            <Html position={[0, 0, 0.96]} center zIndexRange={[5, 0]} pointerEvents="none">
              <div style={{ color: '#fff', fontSize: narrow ? 10 : 12, fontWeight: on ? 700 : 500, whiteSpace: 'nowrap', letterSpacing: 0.2, textShadow: '0 1px 2px rgba(0,0,0,.35)' }}>{narrow ? (l.n === 1 ? 'Link' : l.short) : l.name}</div>
            </Html>
          </group>
        )
      })}
      <Html position={[0, yOf(4) + 0.78, 0]} center zIndexRange={[5, 0]} pointerEvents="none">
        <div style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
          <div style={{ color: 'rgb(var(--ink))', fontSize: narrow ? 11 : 14, fontWeight: 600 }}>{narrow ? ({ 'Smart meter': 'Meter', 'MQTT broker': 'Broker', 'Lab server': 'Server' } as Record<string, string>)[label] ?? label : label}</div>
          {!narrow && <div style={{ color: 'rgb(var(--ink3))', fontSize: 11 }}>{sub}</div>}
        </div>
      </Html>
    </group>
  )
}

/** Packet = payload core plus one shell per header currently wrapped around it. */
function Packet({ headers }: { headers: number }) {
  return (
    <group>
      <mesh><boxGeometry args={[0.22, 0.22, 0.22]} /><meshStandardMaterial color="#f2a900" emissive="#f2a900" emissiveIntensity={0.7} /></mesh>
      {LAYERS.slice().reverse().map((l, i) => i < headers && (
        <mesh key={l.n}>
          <boxGeometry args={[0.3 + i * 0.09, 0.3 + i * 0.09, 0.3 + i * 0.09]} />
          <meshStandardMaterial color={l.color} transparent opacity={0.32} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function Fit() {
  const { camera, size } = useThree()
  useEffect(() => {
    // fit ~14.5 units wide and ~5.6 tall (three stacks, labels and links) into the canvas
    const aspect = size.width / Math.max(1, size.height)
    const k = 2 * Math.tan((34 / 2) * (Math.PI / 180))
    const z = Math.min(32, Math.max((aspect < 1.4 ? 13.2 : 14.5) / (aspect * k), 5.6 / k))
    camera.position.set(0, z * 0.24, z)
    camera.lookAt(0, 0.6, 0)
  }, [camera, size.width, size.height])
  return null
}

function Scene({ onStep }: { onStep: (s: StackStep) => void }) {
  const packet = useRef<THREE.Group>(null)
  const clock = useRef(0)
  const last = useRef('')
  const reduced = useStore((s) => s.reducedMotion)
  const [cur, setCur] = useState<StackStep>({ node: 'meter', layer: 4, dir: 'down', headers: 1, text: '' })
  const theme = useStore((s) => s.theme)
  const narrow = useThree((s) => s.size.width) < 640
  useFrame((_, dt) => {
    if (!reduced) clock.current = (clock.current + dt) % TOTAL
    const s = stepAt(clock.current)
    packet.current?.position.lerp(s.pos, 0.35)
    const key = `${s.node}${s.layer}${s.dir}${s.headers}`
    if (key !== last.current) { last.current = key; setCur(s); onStep(s) }
  })
  const linkPts = useMemo(() => {
    const mk = (a: number, b: number) => Array.from({ length: 24 }, (_, i) => { const f = i / 23; return new THREE.Vector3(a + (b - a) * f, yOf(1) - 0.55 - Math.sin(f * Math.PI) * 0.45, 1.15) })
    return [mk(xOf('meter'), xOf('broker')), mk(xOf('broker'), xOf('server'))]
  }, [])
  const lineColor = theme === 'dark' ? '#5c6b62' : '#9aa3ad'
  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 8, 6]} intensity={1.15} castShadow shadow-mapSize={[1024, 1024]} />
      {NODES.map((n) => <Stack key={n.id} x={n.x} label={n.label} sub={n.sub} narrow={narrow} active={cur.node === n.id ? cur.layer : 0} />)}
      {linkPts.map((p, i) => <Line key={i} points={p} color={lineColor} lineWidth={1.5} dashed dashSize={0.12} gapSize={0.1} />)}
      <group ref={packet}><Packet headers={cur.headers} /></group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.27, 0]} receiveShadow>
        <planeGeometry args={[30, 12]} />
        <shadowMaterial opacity={theme === 'dark' ? 0.35 : 0.12} />
      </mesh>
    </>
  )
}

export function OsiStack() {
  const [step, setStep] = useState<StackStep>({ node: 'meter', layer: 4, dir: 'down', headers: 1, text: 'Smart meter · Application: Reading → JSON "Datas" → MQTT PUBLISH (adds MQTT header)' })
  return (
    <div>
      <div className="relative h-[300px] sm:h-[420px] lg:h-[480px]">
        <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 3.4, 12.5], fov: 34 }} style={{ touchAction: 'pan-y' }}>
          <Suspense fallback={null}>
            <Fit />
            <group position={[0, -0.6, 0]}><Scene onStep={setStep} /></group>
            <OrbitControls makeDefault enablePan={false} enableZoom={false} target={[0, 0.6, 0]} minPolarAngle={1.0} maxPolarAngle={1.42} minAzimuthAngle={-0.45} maxAzimuthAngle={0.45} />
          </Suspense>
        </Canvas>
        <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-center">
          <div className="max-w-full rounded-md border hair bg-s1/90 px-3 py-1.5 text-center text-[12.5px] text-ink2 backdrop-blur">
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#f2a900] align-middle" />{step.text}
          </div>
        </div>
      </div>
      <div className="grid gap-px hair-t bg-[rgb(var(--line)/var(--line-a))] sm:grid-cols-2 lg:grid-cols-4">
        {LAYERS.map((l) => {
          const on = step.layer === l.n && step.dir !== 'link'
          return (
            <div key={l.n} className={cx('bg-s1 p-4 transition-colors', on && 'bg-s2')}>
              <div className="flex items-center gap-2">
                <span className="num grid h-6 w-6 place-items-center rounded-sm text-[11px] font-semibold text-white" style={{ background: l.color }}>{l.n}</span>
                <span className="text-[13px] font-semibold text-ink">{l.name}</span>
                <span className="ml-auto rounded-sm bg-s2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink2">{l.short}</span>
              </div>
              <dl className="mt-2.5 space-y-1 text-[12px] leading-snug">
                <div className="flex gap-2"><dt className="w-12 shrink-0 text-ink3">Meter</dt><dd className="text-ink2">{l.meter}</dd></div>
                <div className="flex gap-2"><dt className="w-12 shrink-0 text-ink3">Broker</dt><dd className="text-ink2">{l.broker}</dd></div>
                <div className="flex gap-2"><dt className="w-12 shrink-0 text-ink3">Server</dt><dd className="text-ink2">{l.server}</dd></div>
              </dl>
            </div>
          )
        })}
      </div>
    </div>
  )
}
