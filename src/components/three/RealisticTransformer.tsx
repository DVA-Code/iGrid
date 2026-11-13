import {useGLTF} from '@react-three/drei'
import {useEffect,useLayoutEffect,useMemo} from 'react'
import {useFrame,useThree,type ThreeEvent} from '@react-three/fiber'
import {useStore} from '@/lib/store'
import * as THREE from 'three'
import type {TwinPart,TwinProps} from './Transformer'
const colors={a:'#cd3737',b:'#d4a200',c:'#2363c4'}
function part(o:THREE.Object3D):TwinPart|null{for(let n:THREE.Object3D|null=o;n;n=n.parent){if(n.name==='tank_shell')return'tank';if(n.name==='cooling_system')return'cooling';if(n.name==='core_assembly')return'core';if(/^winding_[ABC]$/.test(n.name))return`w${n.name.slice(-1).toLowerCase()}` as TwinPart;if(/^bushing_/.test(n.name))return'bushings'}return null}
export function RealisticTransformer(props:TwinProps){
 const invalidate=useThree(s=>s.invalidate),reduced=useStore(s=>s.reducedMotion)
 const {scene:source}=useGLTF(`${import.meta.env.BASE_URL}models/gml-transformer.glb`)
 const model=useMemo(()=>{const scene=source.clone(true),materials:THREE.Material[]=[],surfaces:{m:THREE.MeshStandardMaterial;part:TwinPart|null;base:THREE.Color;target:THREE.Color}[]=[];scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;o.castShadow=true;o.receiveShadow=true;const clone=(v:THREE.Material)=>{const m=v.clone();materials.push(m);if(m instanceof THREE.MeshStandardMaterial)surfaces.push({m,part:part(o),base:m.color.clone(),target:m.color.clone()});return m};o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material)});return{scene,materials,surfaces}},[source])
 useEffect(()=>()=>model.materials.forEach(m=>m.dispose()),[model])
 useLayoutEffect(()=>{const cut=['cutaway','phase','imbalance'].includes(props.mode);model.scene.traverse(o=>{if(o.name==='tank_shell'||o.name==='exterior_details')o.visible=!cut;if(o.name==='core_assembly'||/^winding_[ABC]$/.test(o.name))o.visible=cut});for(const s of model.surfaces){s.target.copy(s.base);s.m.emissive.set('#000000');s.m.emissiveIntensity=0;if(s.part==='tank'&&props.mode==='thermal'&&Number.isFinite(props.thermalLevel)){s.target.set(props.thermalColor??'#6da076');s.m.emissive.copy(s.target);s.m.emissiveIntensity=.08}if(s.part===props.selected){s.m.emissive.set('#66aabb');s.m.emissiveIntensity=.2}if(s.part?.startsWith('w')&&['phase','imbalance'].includes(props.mode)){s.m.emissive.set(colors[s.part.slice(1) as 'a'|'b'|'c']);s.m.emissiveIntensity=.25}}},[model,props.mode,props.thermalColor,props.thermalLevel,props.selected])
 useLayoutEffect(()=>{if(reduced)model.surfaces.forEach(s=>s.m.color.copy(s.target));invalidate()},[model,props.mode,props.thermalColor,props.thermalLevel,props.selected,reduced,invalidate])
 useFrame((_,dt)=>{let changed=false;model.surfaces.forEach(s=>{if(Math.abs(s.m.color.r-s.target.r)+Math.abs(s.m.color.g-s.target.g)+Math.abs(s.m.color.b-s.target.b)>.001)changed=true;s.m.color.lerp(s.target,1-Math.exp(-dt*5))});if(changed)invalidate()})
 const pick=(e:ThreeEvent<MouseEvent>)=>{e.stopPropagation();const p=part(e.object);props.onSelect?.(p===props.selected?null:p)}
 return <primitive object={model.scene} scale={.65} position={[0,-.95,0]} onClick={pick} dispose={null}/>
}
