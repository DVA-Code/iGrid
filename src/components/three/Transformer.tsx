import { ContactShadows, Environment, Html, Lightformer, OrbitControls, RoundedBox } from '@react-three/drei'
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { Component, type ReactNode, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useStore } from '@/lib/store'
import {RealisticTransformer} from './RealisticTransformer'

export type TwinMode = 'exterior' | 'cutaway' | 'thermal' | 'phase' | 'flow' | 'imbalance'
export type TwinPart = 'tank' | 'cooling' | 'bushings' | 'wa' | 'wb' | 'wc' | 'core' | 'cable-a' | 'cable-b' | 'cable-c'

export interface TwinProps {
  mode: TwinMode
  thermalColor?: string // category colour (model-inferred)
  thermalLevel?: number // 0..1 display TSI
  shares?: { a: number; b: number; c: number } // relative current-squared shares or current shares
  currents?: { a: number; b: number; c: number }
  selected?: TwinPart | null
  onSelect?: (p: TwinPart | null) => void
  live?: boolean // false = stale/disconnected → no flow animation
  autoRotate?: boolean
  showLabels?: boolean
  interactive?: boolean
  cameraPreset?: 'hero' | 'default'
}

const PHASE = { a: '#CD3737', b: '#D4A200', c: '#2363C4' } // R / Y / B
const TANK_W = 2.0, TANK_H = 1.55, TANK_D = 1.15

/* ---------- geometry helpers ---------- */
function bushingGeometry(height: number, r: number, sheds: number) {
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0), new THREE.Vector2(r * 1.6, 0), new THREE.Vector2(r * 1.6, 0.04)]
  const body = height * 0.82
  for (let i = 0; i < sheds; i++) {
    const y = 0.06 + (i / sheds) * body
    const s = body / sheds
    pts.push(new THREE.Vector2(r, y), new THREE.Vector2(r * 2.1, y + s * 0.28), new THREE.Vector2(r * 2.0, y + s * 0.42), new THREE.Vector2(r, y + s * 0.6))
  }
  pts.push(new THREE.Vector2(r, body + 0.06), new THREE.Vector2(r * 0.55, body + 0.08), new THREE.Vector2(r * 0.55, height), new THREE.Vector2(0, height))
  return new THREE.LatheGeometry(pts, 28)
}

function useMaterials() {
  return useMemo(() => {
    const paint = new THREE.MeshPhysicalMaterial({ color: '#7d8a96', metalness: 0.55, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.35 })
    const darkSteel = new THREE.MeshStandardMaterial({ color: '#3a4149', metalness: 0.7, roughness: 0.45 })
    const porcelainHV = new THREE.MeshPhysicalMaterial({ color: '#8b5a3c', roughness: 0.22, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.1 })
    const porcelainLV = new THREE.MeshPhysicalMaterial({ color: '#d9d6cf', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.12 })
    const brass = new THREE.MeshStandardMaterial({ color: '#c8a35a', metalness: 0.9, roughness: 0.3 })
    const core = new THREE.MeshStandardMaterial({ color: '#4b5056', metalness: 0.6, roughness: 0.55 })
    const plate = new THREE.MeshStandardMaterial({ color: '#c9ced3', metalness: 0.8, roughness: 0.25 })
    return { paint, darkSteel, porcelainHV, porcelainLV, brass, core, plate }
  }, [])
}

/* ---------- winding ---------- */
function Winding({ x, phase, mode, thermalColor, level, share, selected, hovered, onPick, onHover, showLabel }: {
  x: number; phase: 'a' | 'b' | 'c'; mode: TwinMode; thermalColor: string; level: number; share: number
  selected: boolean; hovered: boolean; onPick: () => void; onHover: (h: boolean) => void; showLabel: boolean
}) {
  const mat = useRef<THREE.MeshPhysicalMaterial>(null)
  const ring = useRef<THREE.MeshStandardMaterial>(null)
  const copper = useMemo(() => new THREE.Color('#b8733f'), [])
  const target = useMemo(() => new THREE.Color(), [])
  useFrame((_, dt) => {
    if (!mat.current || !ring.current) return
    const k = 1 - Math.exp(-dt * 4)
    let emissive = new THREE.Color('#000000'), intensity = 0
    if (mode === 'thermal') { emissive = new THREE.Color(thermalColor); intensity = 0.25 + level * 0.9 }
    if (mode === 'phase' || mode === 'imbalance') { emissive = new THREE.Color(PHASE[phase]); intensity = 0.15 + share * 1.6 }
    if (selected || hovered) intensity += 0.35
    target.copy(emissive)
    mat.current.emissive.lerp(target, k)
    mat.current.emissiveIntensity += (intensity - mat.current.emissiveIntensity) * k
    mat.current.color.lerp(copper, k)
    ring.current.emissiveIntensity += ((mode === 'phase' || mode === 'imbalance' || selected ? 1.2 : 0.5) - ring.current.emissiveIntensity) * k
  })
  return (
    <group position={[x, -0.02, 0]}>
      <mesh castShadow onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onPick() }}
        onPointerOver={(e) => { e.stopPropagation(); onHover(true) }} onPointerOut={() => onHover(false)}>
        <cylinderGeometry args={[0.24, 0.24, 0.86, 48, 1, true]} />
        <meshPhysicalMaterial ref={mat} color="#b8733f" metalness={0.75} roughness={0.32} clearcoat={0.4} side={THREE.DoubleSide} />
      </mesh>
      {/* inner LV layer */}
      <mesh><cylinderGeometry args={[0.17, 0.17, 0.9, 40, 1, true]} /><meshStandardMaterial color="#8e5530" metalness={0.7} roughness={0.4} side={THREE.DoubleSide} /></mesh>
      {/* end rings in phase colour */}
      {[0.44, -0.44].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.245, 0.012, 10, 48]} />
          <meshStandardMaterial ref={y > 0 ? ring : undefined} color={PHASE[phase]} emissive={PHASE[phase]} emissiveIntensity={0.5} />
        </mesh>
      ))}
      {showLabel && (
        <Html position={[0, 0.62, 0]} center zIndexRange={[10, 0]} pointerEvents="none">
          <div className="select-none whitespace-nowrap rounded-full border px-1.5 py-[1px] text-[10px] font-semibold backdrop-blur" style={{ color: PHASE[phase], borderColor: `${PHASE[phase]}55`, background: 'rgba(10,12,15,.65)' }}>
            Phase {phase.toUpperCase()}
          </div>
        </Html>
      )}
    </group>
  )
}

/* ---------- cable with flowing particles (visual encoding of current) ---------- */
function Cable({ phase, start, current, maxCurrent, live, highlight, dim, onPick }: {
  phase: 'a' | 'b' | 'c'; start: THREE.Vector3; current: number; maxCurrent: number; live: boolean; highlight: boolean; dim: boolean; onPick: () => void
}) {
  const curve = useMemo(() => {
    const end = new THREE.Vector3(start.x + 2.3, -0.6, start.z * 1.6 + (phase === 'a' ? -0.7 : phase === 'c' ? 0.7 : 0))
    return new THREE.CatmullRomCurve3([start, start.clone().add(new THREE.Vector3(0.12, 0.18, 0)), new THREE.Vector3(start.x + 1.0, 0.7, (start.z + end.z) / 2), end])
  }, [start, phase])
  const tube = useMemo(() => new THREE.TubeGeometry(curve, 80, 0.028, 10, false), [curve])
  const N = 26
  const pts = useRef<THREE.InstancedMesh>(null)
  const offset = useRef(Math.random())
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const reduced = useStore((s) => s.reducedMotion)
  const norm = Number.isFinite(current) && maxCurrent > 0 ? Math.min(1,Math.max(0,current / maxCurrent)) : 0
  useFrame((_, dt) => {
    if (!pts.current) return
    if (live && !reduced) offset.current = (offset.current + dt * (0.08 + norm * 0.22)) % 1
    const visible = live && norm>0 ? Math.round(N * (0.25 + 0.75 * norm)) : 0
    for (let i = 0; i < N; i++) {
      const u = (i / N + offset.current) % 1
      const p = curve.getPointAt(u)
      dummy.position.copy(p)
      const s = i < visible ? 0.028 + norm * 0.02 : 0
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      pts.current.setMatrixAt(i, dummy.matrix)
    }
    pts.current.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      <mesh geometry={tube} onClick={(e) => { e.stopPropagation(); onPick() }}>
        <meshStandardMaterial color={PHASE[phase]} emissive={PHASE[phase]} emissiveIntensity={highlight ? 0.9 : 0.25 + norm * 0.4} transparent opacity={dim ? 0.25 : 0.85} roughness={0.4} />
      </mesh>
      <instancedMesh ref={pts} args={[undefined, undefined, N]}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial color={PHASE[phase]} toneMapped={false} transparent opacity={dim ? 0.3 : 1} />
      </instancedMesh>
    </group>
  )
}

/* ---------- transformer model ---------- */
export function ProceduralModel(props: TwinProps & { hovered: TwinPart | null; setHovered: (p: TwinPart | null) => void }) {
  const { mode, thermalColor = '#3FB37F', thermalLevel = 0, shares = { a: 1 / 3, b: 1 / 3, c: 1 / 3 }, selected, onSelect, hovered, setHovered, currents, live = true } = props
  const M = useMaterials()
  const tankMat = useRef<THREE.MeshPhysicalMaterial>(null)
  const finRef = useRef<THREE.InstancedMesh>(null)
  const cut = mode === 'cutaway' || mode === 'thermal' || mode === 'phase' || mode === 'imbalance'
  const hvGeo = useMemo(() => bushingGeometry(0.62, 0.045, 6), [])
  const lvGeo = useMemo(() => bushingGeometry(0.3, 0.035, 3), [])
  const pick = (p: TwinPart) => onSelect?.(selected === p ? null : p)
  const hover = (p: TwinPart) => (h: boolean) => { setHovered(h ? p : null); document.body.style.cursor = h ? 'pointer' : '' }

  // radiator fins (instanced)
  const finCount = 13
  useLayoutEffect(() => {
    if (!finRef.current) return
    const d = new THREE.Object3D()
    let i = 0
    for (const side of [-1, 1]) {
      for (let k = 0; k < finCount; k++) {
        d.position.set(-0.78 + k * 0.13, -0.06, side * (TANK_D / 2 + 0.16))
        d.scale.set(1, 1, 1)
        d.updateMatrix()
        finRef.current.setMatrixAt(i++, d.matrix)
      }
    }
    finRef.current.instanceMatrix.needsUpdate = true
  }, [])

  useFrame((_, dt) => {
    const k = 1 - Math.exp(-dt * 4)
    if (tankMat.current) {
      const targetOpacity = cut ? 0.13 : 1
      tankMat.current.opacity += (targetOpacity - tankMat.current.opacity) * k
      tankMat.current.depthWrite = tankMat.current.opacity > 0.9
      const em = mode === 'thermal' ? new THREE.Color(thermalColor) : new THREE.Color('#000')
      tankMat.current.emissive.lerp(em, k)
      const ei = mode === 'thermal' ? 0.08 + thermalLevel * 0.22 : selected === 'tank' || hovered === 'tank' ? 0.12 : 0
      tankMat.current.emissiveIntensity += (ei - tankMat.current.emissiveIntensity) * k
      if (selected === 'tank' || hovered === 'tank') tankMat.current.emissive.lerp(new THREE.Color('#7a97ba'), k)
    }
    if (finRef.current) {
      const m = finRef.current.material as THREE.MeshPhysicalMaterial
      const o = cut ? 0.18 : 1
      m.opacity += (o - m.opacity) * k
      m.depthWrite = m.opacity > 0.9
      const ei = selected === 'cooling' || hovered === 'cooling' ? 0.22 : 0
      m.emissiveIntensity += (ei - m.emissiveIntensity) * k
    }
  })

  const maxI = currents ? Math.max(currents.a, currents.b, currents.c, 1) : 1
  const maxShare = Math.max(shares.a, shares.b, shares.c)
  // relative emphasis: the most loaded phase → 1, others scaled (exaggerated with a power so differences read clearly)
  const relShare = (s: number) => (maxShare > 0 ? Math.pow(s / maxShare, 4) : 0)
  const lvX = [-0.55, -0.2, 0.15, 0.5]
  const showCables = mode === 'flow' || mode === 'imbalance'
  const maxPhase = currents ? (currents.a >= currents.b && currents.a >= currents.c ? 'a' : currents.b >= currents.c ? 'b' : 'c') : null

  return (
    <group position={[0, 0.05, 0]}>
      {/* base skid */}
      {[-0.42, 0.42].map((z) => (
        <mesh key={z} position={[0, -TANK_H / 2 - 0.09, z]} castShadow receiveShadow material={M.darkSteel}><boxGeometry args={[TANK_W + 0.3, 0.12, 0.14]} /></mesh>
      ))}
      {/* tank */}
      <RoundedBox args={[TANK_W, TANK_H, TANK_D]} radius={0.05} smoothness={4} castShadow receiveShadow
        onClick={(e) => { e.stopPropagation(); pick('tank') }} onPointerOver={(e) => { e.stopPropagation(); hover('tank')(true) }} onPointerOut={() => hover('tank')(false)}>
        <meshPhysicalMaterial ref={tankMat} color="#7d8a96" metalness={0.55} roughness={0.38} clearcoat={0.6} clearcoatRoughness={0.35} transparent />
      </RoundedBox>
      {/* cover */}
      <RoundedBox args={[TANK_W + 0.08, 0.06, TANK_D + 0.08]} radius={0.02} position={[0, TANK_H / 2 + 0.03, 0]} castShadow material={M.paint} />
      {/* stiffener bands */}
      {!cut && [-0.45, 0.45].map((y) => (
        <mesh key={y} position={[0, y, 0]} material={M.paint}><boxGeometry args={[TANK_W + 0.025, 0.04, TANK_D + 0.025]} /></mesh>
      ))}
      {/* radiator fins */}
      <instancedMesh ref={finRef} args={[undefined, undefined, finCount * 2]} castShadow
        onClick={(e) => { e.stopPropagation(); pick('cooling') }} onPointerOver={(e) => { e.stopPropagation(); hover('cooling')(true) }} onPointerOut={() => hover('cooling')(false)}>
        <boxGeometry args={[0.035, 1.15, 0.3]} />
        <meshPhysicalMaterial color="#76838f" metalness={0.55} roughness={0.42} clearcoat={0.4} emissive="#7a97ba" emissiveIntensity={0} transparent />
      </instancedMesh>
      {/* radiator headers */}
      {!cut && [-1, 1].flatMap((side) => [0.52, -0.64].map((y) => (
        <mesh key={`${side}${y}`} position={[0, y, side * (TANK_D / 2 + 0.16)]} rotation={[0, 0, Math.PI / 2]} material={M.paint}><cylinderGeometry args={[0.035, 0.035, 1.7, 14]} /></mesh>
      )))}
      {/* nameplate */}
      {!cut && <mesh position={[0.62, 0.15, TANK_D / 2 + 0.006]} material={M.plate}><boxGeometry args={[0.32, 0.2, 0.01]} /></mesh>}
      {/* lifting lugs */}
      {[-0.85, 0.85].map((x) => (
        <mesh key={x} position={[x, TANK_H / 2 + 0.12, 0]} rotation={[0, Math.PI / 2, 0]} material={M.paint}><torusGeometry args={[0.07, 0.022, 10, 24, Math.PI]} /></mesh>
      ))}
      {/* HV bushings (3) */}
      <group onClick={(e) => { e.stopPropagation(); pick('bushings') }} onPointerOver={(e) => { e.stopPropagation(); hover('bushings')(true) }} onPointerOut={() => hover('bushings')(false)}>
        {[-0.45, 0, 0.45].map((x, i) => (
          <group key={x} position={[x, TANK_H / 2 + 0.06, -0.26]}>
            <mesh geometry={hvGeo} castShadow material={M.porcelainHV} />
            <mesh position={[0, 0.66, 0]} material={M.brass}><cylinderGeometry args={[0.022, 0.022, 0.08, 12]} /></mesh>
            {(selected === 'bushings' || hovered === 'bushings') && <mesh position={[0, 0.3, 0]}><cylinderGeometry args={[0.11, 0.11, 0.66, 20, 1, true]} /><meshBasicMaterial color="#7a97ba" transparent opacity={0.12} side={THREE.DoubleSide} /></mesh>}
            <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.085, 0.008, 8, 28]} /><meshStandardMaterial color={['#CD3737', '#D4A200', '#2363C4'][i]} emissive={['#CD3737', '#D4A200', '#2363C4'][i]} emissiveIntensity={0.6} /></mesh>
          </group>
        ))}
        {/* LV bushings (3 phases + neutral) */}
        {lvX.map((x) => (
          <group key={x} position={[x, TANK_H / 2 + 0.06, 0.3]}>
            <mesh geometry={lvGeo} castShadow material={M.porcelainLV} />
            <mesh position={[0, 0.33, 0]} material={M.brass}><boxGeometry args={[0.07, 0.05, 0.02]} /></mesh>
          </group>
        ))}
      </group>

      {/* internal active part: 3-limb core + windings */}
      <group visible={cut} scale={0.98}>
        <mesh position={[0, 0.52, 0]} material={M.core} onClick={(e) => { e.stopPropagation(); pick('core') }}><boxGeometry args={[1.6, 0.16, 0.26]} /></mesh>
        <mesh position={[0, -0.56, 0]} material={M.core} onClick={(e) => { e.stopPropagation(); pick('core') }}><boxGeometry args={[1.6, 0.16, 0.26]} /></mesh>
        {[-0.62, 0, 0.62].map((x) => <mesh key={x} position={[x, -0.02, 0]} material={M.core}><boxGeometry args={[0.2, 0.96, 0.2]} /></mesh>)}
        {(['a', 'b', 'c'] as const).map((p, i) => (
          <Winding key={p} x={[-0.62, 0, 0.62][i]} phase={p} mode={mode} thermalColor={thermalColor} level={thermalLevel}
            share={relShare(shares[p])} selected={selected === `w${p}`} hovered={hovered === `w${p}`}
            onPick={() => pick(`w${p}` as TwinPart)} onHover={hover(`w${p}` as TwinPart)} showLabel={!!props.showLabels && cut} />
        ))}
      </group>

      {showCables && currents && (['a', 'b', 'c'] as const).map((p, i) => (
        <Cable key={p} phase={p} start={new THREE.Vector3(lvX[i], TANK_H / 2 + 0.42, 0.3)} current={currents[p]} maxCurrent={maxI * 1.05} live={live}
          highlight={selected === `cable-${p}` || (mode === 'imbalance' && maxPhase === p)}
          dim={!!selected && selected.startsWith('cable') && selected !== `cable-${p}`}
          onPick={() => pick(`cable-${p}` as TwinPart)} />
      ))}
    </group>
  )
}

/* ---------- camera rig ---------- */
function Rig({ mode, preset, controls }: { mode: TwinMode; preset: 'hero' | 'default'; controls: React.RefObject<OrbitControlsImpl> }) {
  const { camera, size,invalidate } = useThree()
  const reduced=useStore(s=>s.reducedMotion)
  const goal = useRef(new THREE.Vector3())
  const look = useRef(new THREE.Vector3())
  const moving = useRef(true)
  useEffect(() => {
    const narrow = size.width < 520
    const d = narrow ? 1.3 : 1
    if (mode === 'flow' || mode === 'imbalance') { goal.current.set(2.4 * d, 2.7 * d, 6.6 * d); look.current.set(0.75, 0.1, 0) }
    else if (mode === 'cutaway' || mode === 'thermal' || mode === 'phase') { goal.current.set(1.1 * d, 1.7 * d, 6.3 * d); look.current.set(0, 0.22, 0) }
    else if (preset === 'hero') { goal.current.set(3.0 * d, 2.1 * d, 6.2 * d); look.current.set(0.55, 0.15, 0) }
    else { goal.current.set(3.6 * d, 2.2 * d, 4.9 * d); look.current.set(0, 0.15, 0) }
    moving.current = true
    if(reduced){camera.position.copy(goal.current);controls.current?.target.copy(look.current);controls.current?.update();moving.current=false}
    invalidate()
  }, [mode, preset, size.width,reduced,camera,controls,invalidate])
  useFrame((_, dt) => {
    if (!moving.current) return
    const k = 1 - Math.exp(-dt * 2.6)
    camera.position.lerp(goal.current, k)
    if (controls.current) { controls.current.target.lerp(look.current, k); controls.current.update() }
    if (camera.position.distanceTo(goal.current) < 0.01) moving.current = false
    else invalidate()
  })
  useEffect(() => {
    const c = controls.current
    if (!c) return
    const stop = () => { moving.current = false }
    c.addEventListener('start', stop)
    return () => c.removeEventListener('start', stop)
  }, [controls])
  return null
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas')
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')))
  } catch { return false }
}

function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(true)
  useEffect(() => {
    if (!ref.current) return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: '100px' })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [])
  return { ref, inView }
}

function ModelReady({onReady}:{onReady:()=>void}){useEffect(onReady,[onReady]);return null}

function TransformerContent(props: TwinProps & { className?: string }) {
  const [ok] = useState(webglAvailable)
  const [poster,setPoster]=useState(false)
  const controls = useRef<OrbitControlsImpl>(null)
  const reduced = useStore((s) => s.reducedMotion)
  const theme = useStore((s) => s.theme)
  const { ref, inView } = useInView<HTMLDivElement>()
  const [ready, setReady] = useState(false)
  const [visible,setVisible]=useState(!document.hidden)
  useEffect(()=>{const changed=()=>setVisible(!document.hidden);document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed)},[])
  useEffect(()=>{if(ready)return;const timer=setTimeout(()=>setPoster(true),20000);return()=>clearTimeout(timer)},[ready])
  const interactive = props.interactive ?? true

  if (!ok || poster) {
    return (
      <div className={`grid place-items-center rounded-lg bg-s2 p-6 text-center ${props.className ?? ''}`}>
        <div>
          <img src={`${import.meta.env.BASE_URL}models/transformer-exterior.png`} alt="Detailed illustrative transformer with cooling fins and bushings" className="max-h-72 w-full object-contain"/>
          <button onClick={()=>setPoster(false)} disabled={!ok} className="mt-2 text-xs">{ok?'Return to interactive 3D':'Static model · 3D unavailable on this device'}</button>
        </div>
      </div>
    )
  }

  return (
    <div ref={ref} className={`relative ${props.className ?? ''}`}>
      <button onClick={()=>setPoster(true)} className="absolute right-2 top-2 z-10 rounded border hair bg-s1/90 px-2 py-1 text-[10px]">Static view</button>
      <div className={`absolute inset-0 grid place-items-center transition-opacity duration-700 ${ready ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
        <div className="absolute inset-0"><img src={`${import.meta.env.BASE_URL}models/transformer-exterior.png`} alt="Loading detailed transformer" className="h-full w-full object-contain opacity-70"/><span className="absolute bottom-10 left-4 rounded bg-s1/90 px-2 py-1 font-mono text-[9px] text-ink3">LOADING 3D ASSET</span></div>
      </div>
      <Canvas
        shadows
        dpr={[1, 1.5]}
        frameloop={inView&&visible&&!reduced ? 'always' : 'demand'}
        camera={{ position: [5, 3, 6], fov: 32, near: 0.1, far: 60 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.12 }}
        onPointerMissed={() => props.onSelect?.(null)}
        style={{ touchAction: interactive ? 'pan-y' : 'auto' }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={theme === 'dark' ? 0.35 : 0.55} />
          <directionalLight position={[4, 6, 3]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} />
          <directionalLight position={[-5, 3, -4]} intensity={0.5} color="#9fb6d8" />
          <Environment resolution={256}>
            <Lightformer intensity={2} position={[0, 5, -6]} scale={[10, 3, 1]} />
            <Lightformer intensity={1.2} position={[-6, 2, 2]} rotation-y={Math.PI / 2} scale={[8, 2, 1]} color="#cfe0ff" />
            <Lightformer intensity={0.8} position={[6, 1, 3]} rotation-y={-Math.PI / 2} scale={[8, 2, 1]} color="#ffe6cf" />
            <Lightformer intensity={0.5} position={[0, -4, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} color="#20252b" />
          </Environment>
          <RealisticTransformer {...props}/>
          <ModelReady onReady={()=>setReady(true)}/>
          {['flow','imbalance'].includes(props.mode)&&(['a','b','c'] as const).map((p,i)=>{
            const current=Number.isFinite(props.currents?.[p])?props.currents![p]:0
            const max=Math.max(1,...Object.values(props.currents??{}).map(n=>Number.isFinite(n)?n:0))
            return <Cable key={p} phase={p} start={new THREE.Vector3((i-1)*.48,1.15,.35)} current={current} maxCurrent={max} live={!!props.live} highlight={props.selected===`cable-${p}`} dim={false} onPick={()=>props.onSelect?.(`cable-${p}`)}/>
          })}
          <ContactShadows position={[0, -0.95, 0]} opacity={theme === 'dark' ? 0.55 : 0.35} scale={9} blur={2.4} far={2.4} />
          <Rig mode={props.mode} preset={props.cameraPreset ?? 'default'} controls={controls} />
          <OrbitControls ref={controls} makeDefault enabled={interactive} enablePan={false} enableDamping dampingFactor={0.08}
            minDistance={3} maxDistance={11} minPolarAngle={0.25} maxPolarAngle={Math.PI / 2.05}
            autoRotate={!!props.autoRotate && !reduced && !props.selected} autoRotateSpeed={0.45} />
        </Suspense>
      </Canvas>
    </div>
  )
}

class ModelBoundary extends Component<{children:ReactNode;className?:string},{failed:boolean}>{
  state={failed:false}
  static getDerivedStateFromError(){return{failed:true}}
  render(){return this.state.failed?<div className={`grid place-items-center bg-s2 ${this.props.className??''}`}><div className="p-4 text-center"><img src={`${import.meta.env.BASE_URL}models/transformer-exterior.png`} alt="Illustrative transformer" className="max-h-72 w-full object-contain"/><p className="mt-2 text-xs text-ink3">Static model · numerical readings remain available</p><button onClick={()=>this.setState({failed:false})} className="mt-2 text-xs text-brand">Retry 3D</button></div></div>:this.props.children}
}
export function TransformerTwin(props:TwinProps&{className?:string}){return <ModelBoundary className={props.className}><TransformerContent {...props}/></ModelBoundary>}
