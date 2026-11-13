import type { CSSProperties } from 'react'
import logoUrl from '@/assets/gml-logo.png'
import { Icon, type IconName } from './symbols'

type P = { width?: number; height?: number; className?: string; style?: CSSProperties }
const mk = (name: IconName) => (p: P) => <Icon name={name} size={p.width ?? 20} className={p.className} style={p.style} />

export const IconThermal = mk('thermostat')
export const IconEnergy = mk('electric_meter')
export const IconInverter = mk('solar_power')
export const IconMap = mk('map')
export const IconPeople = mk('group')
export const IconHome = mk('home')
export const IconSun = mk('light_mode')
export const IconMoon = mk('dark_mode')
export const IconMotion = mk('animation')
export const IconArrow = mk('arrow_forward')
export const IconClose = mk('close')
export const IconPlay = mk('play_arrow')
export const IconPause = mk('pause')
export const IconReset = mk('restart_alt')
export const IconDownload = mk('download')

/** GRID Modernization Laboratory logo (official artwork). On dark theme it sits on a white plate for legibility. */
export function Logo({ height = 36, plate = false }: { height?: number; plate?: boolean }) {
  return (
    <span className={plate ? 'inline-flex rounded-sm bg-white px-1.5 py-1' : 'inline-flex dark-plate'}>
      <img src={logoUrl} alt="GRID Modernization Laboratory" style={{ height, width: 'auto' }} draggable={false} />
    </span>
  )
}

export const PROJECT_ICON = { thermal: IconThermal, energy: IconEnergy, map: IconMap, inverter: IconInverter, people: IconPeople }
