import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { BUSES, busById, LINES, METER_BUS, type MeterState, STATE_META } from '@/lib/grid'
import { cx } from '@/components/ui/ui'
import { Icon } from '@/components/ui/symbols'
import { escapeHtml } from '@/lib/safeHtml'

export interface MeterView { sn: string; name: string; short: string; bus: number; state: MeterState; kw: number | null; verified: boolean }
export interface LineView { id: string; state: 'flow' | 'idle' | 'fault' | 'nodata' | 'unmonitored' | 'dead'; kw: number | null; note?: string }
type Basemap = 'light' | 'street' | 'satellite' | 'schematic'

const TILES: Record<Exclude<Basemap, 'schematic'>, { url: string; attr: string; maxNative: number; subdomains?: string; className?: string }> = {
  // all free, no API key
  light: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '&copy; OpenStreetMap contributors', maxNative: 19, className: 'tiles-muted' },
  street: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '&copy; OpenStreetMap contributors', maxNative: 19 },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Imagery &copy; Esri, Maxar, Earthstar Geographics', maxNative: 19 },
}

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim().split(' ').join(',')
const NETWORK_BOUNDS = L.latLngBounds(BUSES.map((b) => [b.lat, b.lon] as [number, number])).pad(0.1)

function lineStyle(v: LineView | undefined): L.PathOptions & { className?: string } {
  const s = v?.state ?? 'unmonitored'
  const w = v?.kw ? Math.min(7, 2.5 + Math.abs(v.kw) / 25) : 2
  if (s === 'flow') return { color: `rgb(${css('--ok')})`, weight: w, opacity: 0.95, className: v!.kw! > 40 ? 'grid-flow-fast' : 'grid-flow' }
  if (s === 'fault') return { color: `rgb(${css('--bad')})`, weight: 4.5, opacity: 1, dashArray: '2 7', className: '' }
  if (s === 'dead') return { color: `rgb(${css('--bad')})`, weight: 3, opacity: 0.55, className: '' }
  if (s === 'nodata') return { color: `rgb(${css('--warn')})`, weight: 3, opacity: 0.9, dashArray: '4 6', className: '' }
  if (s === 'idle') return { color: `rgb(${css('--sun')})`, weight: w, opacity: 0.9, className: 'grid-flow' }
  return { color: `rgb(${css('--ink3')})`, weight: 1.8, opacity: 0.55, className: '' }
}

function bearing(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  return (Math.atan2(b.lon - a.lon, b.lat - a.lat) * 180) / Math.PI
}

function arrowIcon(deg: number, color: string) {
  return L.divIcon({ className: '', iconSize: [14, 14], iconAnchor: [7, 7], html: `<svg width="14" height="14" viewBox="0 0 14 14" style="transform:rotate(${deg}deg)"><path d="M7 1 L12 11 L7 8.5 L2 11 Z" fill="${color}"/></svg>` })
}

function meterIcon(m: MeterView, selected: boolean) {
  const meta = STATE_META[m.state]
  const alert = m.state === 'outage' || m.state === 'phase-loss' || m.state === 'overload'
  const kw = m.kw !== null && Number.isFinite(m.kw) ? `${m.kw.toFixed(m.kw < 10 ? 1 : 0)} kW` : meta.short
  const pulse = m.state === 'live' || alert
  const sym = alert ? '!' : m.state === 'stale' || m.state === 'nodata' ? '?' : ''
  return L.divIcon({
    className: '', iconSize: [0, 0], iconAnchor: [0, 0],
    html: `<div style="position:relative;transform:translate(-50%,-50%);">
      <div class="meter-pin" style="color:${meta.color};width:${selected ? 22 : 18}px;height:${selected ? 22 : 18}px;border-radius:999px;background:${meta.color};border:3px solid rgb(${css('--s1')});box-shadow:0 1px 4px rgba(0,0,0,.3);display:grid;place-items:center;color:#fff;font:700 11px/1 'IBM Plex Sans',sans-serif">${pulse ? `<span class="ring" style="color:${meta.color}"></span>` : ''}${sym}</div>
      <div style="position:absolute;left:50%;top:${selected ? 18 : 15}px;transform:translateX(-50%);white-space:nowrap;background:rgb(${css('--s1')});color:rgb(${css('--ink')});border:1px solid ${selected ? meta.color : `rgba(${css('--line')},.2)`};border-radius:3px;padding:2px 6px;font:600 11px/1.3 'IBM Plex Sans',sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.12)">${escapeHtml(m.short)}<br/><span style="font-weight:500;color:${meta.color}">${kw}</span></div>
    </div>`,
  })
}

function transformerIcon(state: MeterState) {
  const c = STATE_META[state].color
  return L.divIcon({ className: '', iconSize: [30, 30], iconAnchor: [15, 15], html: `<div style="width:30px;height:30px;border-radius:4px;background:rgb(${css('--navy')});border:3px solid ${c};display:grid;place-items:center;box-shadow:0 2px 6px rgba(0,0,0,.3)"><svg width="18" height="18" viewBox="0 -960 960 960" fill="#fff"><path d="m422-232 207-248H469l29-227-185 267h139l-30 208ZM320-80l40-280H160l360-520h80l-40 320h240L400-80h-80Z"/></svg></div>` })
}

export function GridMap({ meters, lines, selected, onSelect, transformerState, className }: {
  meters: MeterView[]; lines: Record<string, LineView>; selected: string | null; onSelect: (sn: string | null) => void; transformerState: MeterState; className?: string
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const tiles = useRef<L.TileLayer | null>(null)
  const lineLayers = useRef(new Map<string, L.Polyline>())
  const arrows = useRef(new Map<string, L.Marker>())
  const meterLayers = useRef(new Map<string, L.Marker>())
  const trafo = useRef<L.Marker | null>(null)
  const [basemap, setBasemap] = useState<Basemap>('light')
  const [tileNote, setTileNote] = useState<string | null>(null)
  const userGesture = useRef(false)

  // create map once
  useEffect(() => {
    if (!el.current || map.current) return
    const m = L.map(el.current, { center: [27.6191, 85.5381], zoom: 18, minZoom: 16, maxZoom: 20, zoomControl: true, attributionControl: true, preferCanvas: false, zoomSnap: 0.25 })
    map.current = m
    m.fitBounds(NETWORK_BOUNDS)
    // keep the network framed while the container settles (page entrance, rotation), until the user pans or zooms
    let alive = true
    const ro = new ResizeObserver(() => {
      if (!alive || !m.getContainer().isConnected) return
      m.invalidateSize({ animate: false })
      if (!userGesture.current) m.fitBounds(NETWORK_BOUNDS, { animate: false })
    })
    ro.observe(el.current)
    const markGesture = () => { userGesture.current = true }
    el.current.addEventListener('pointerdown', markGesture)
    el.current.addEventListener('wheel', markGesture, { passive: true })
    // buses (unmetered)
    for (const b of BUSES) {
      if (b.id === 0 || METER_BUS.some((x) => x.bus === b.id)) continue
      const named = !/^LVB\d+$/.test(b.name)
      L.circleMarker([b.lat, b.lon], { radius: named ? 4.5 : 2.5, color: `rgb(${css('--navy')})`, weight: 1.5, fillColor: `rgb(${css('--s1')})`, fillOpacity: 1, opacity: 0.7 })
        .bindTooltip(`${escapeHtml(b.name)}${named ? ' · not metered' : ''}`, { className: 'gml-tip', direction: 'top' }).addTo(m)
    }
    // lines + arrows
    for (const l of LINES) {
      const a = busById.get(l.from)!, b = busById.get(l.to)!
      const pl = L.polyline([[a.lat, a.lon], [b.lat, b.lon]], { ...lineStyle(undefined), interactive: true }).addTo(m)
      lineLayers.current.set(l.id, pl)
      const mid: [number, number] = [(a.lat + b.lat) / 2, (a.lon + b.lon) / 2]
      const ar = L.marker(mid, { icon: arrowIcon(bearing(a, b), `rgb(${css('--navy')})`), interactive: false, keyboard: false }).addTo(m)
      arrows.current.set(l.id, ar)
    }
    const t = busById.get(0)!
    trafo.current = L.marker([t.lat, t.lon], { icon: transformerIcon('demo'), keyboard: false }).addTo(m)
      .bindTooltip('Main transformer · 200 kVA, 11/0.4 kV', { className: 'gml-tip', direction: 'top' })
    trafo.current.on('click', () => onSelect('main-transformer'))
    return () => { alive = false; ro.disconnect(); m.stop(); m.off(); m.remove(); map.current = null; lineLayers.current.clear(); arrows.current.clear(); meterLayers.current.clear() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // basemap
  useEffect(() => {
    const m = map.current
    if (!m) return
    tiles.current?.remove(); tiles.current = null
    el.current?.classList.toggle('schematic', basemap === 'schematic')
    if (basemap === 'schematic') return
    let ok = 0, bad = 0
    const T = TILES[basemap]
    const tl = L.tileLayer(T.url, { maxZoom: 20, maxNativeZoom: T.maxNative, attribution: T.attr, className: T.className ?? '' })
    tl.on('tileload', () => { ok++ })
    tl.on('tileerror', () => { bad++; if (bad >= 6 && ok === 0) { setTileNote('Map tiles could not load (offline or blocked). Showing the schematic view.'); setTimeout(() => setTileNote(null), 6000); setBasemap('schematic') } })
    tl.addTo(m); tl.bringToBack()
    tiles.current = tl
  }, [basemap])

  // live line states
  useEffect(() => {
    for (const l of LINES) {
      const v = lines[l.id]
      const pl = lineLayers.current.get(l.id)
      if (!pl) continue
      const st = lineStyle(v)
      pl.setStyle(st)
      const path = (pl as unknown as { _path?: SVGPathElement })._path
      if (path) path.setAttribute('class', `leaflet-interactive ${st.className ?? ''}`)
      const kw = v?.kw
      pl.unbindTooltip().bindTooltip(
        `<b>${escapeHtml(l.id)}</b><br/>${v?.state === 'flow' ? `Metered load downstream: ${kw?.toFixed(1)} kW<br/>` : v?.state === 'unmonitored' || !v ? 'No meter on this branch<br/>' : ''}${v?.note ? `${escapeHtml(v.note)}<br/>` : ''}<span style="color:rgb(${css('--ink3')})">Load-flow study: ${l.studyKw.toFixed(1)} kW · ${l.studyLoading.toFixed(1)} % loading</span>`,
        { className: 'gml-tip', sticky: true })
      const ar = arrows.current.get(l.id)
      if (ar) {
        const a = busById.get(l.from)!, b = busById.get(l.to)!
        const color = st.color as string
        ar.setIcon(arrowIcon(bearing(a, b)+(kw!==null&&kw!==undefined&&kw<0?180:0), color))
        ar.setOpacity(v?.state === 'unmonitored' || !v ? 0.35 : v.state === 'dead' ? 0.2 : 1)
      }
    }
  }, [lines])

  // meters
  useEffect(() => {
    const m = map.current
    if (!m) return
    for (const mv of meters) {
      if (mv.bus === 1) continue // transformer meter shown on the transformer
      const b = busById.get(mv.bus)!
      let mk = meterLayers.current.get(mv.sn)
      const icon = meterIcon(mv, selected === mv.sn)
      if (!mk) {
        mk = L.marker([b.lat, b.lon], { icon, keyboard: true, title: mv.name, riseOnHover: true }).addTo(m)
        mk.on('click', () => onSelect(mv.sn))
        meterLayers.current.set(mv.sn, mk)
      } else mk.setIcon(icon)
      mk.setZIndexOffset(selected === mv.sn ? 1000 : 500)
    }
    trafo.current?.setIcon(transformerIcon(transformerState))
  }, [meters, selected, transformerState, onSelect])

  // fly to selection (not for the default selection on first render, so the whole network shows first)
  const lastSelection = useRef(selected)
  useEffect(() => {
    const m = map.current
    if (lastSelection.current === selected) return
    lastSelection.current = selected
    if (!m || !selected) return
    const mv = meters.find((x) => x.sn === selected)
    if (!mv) return
    const b = busById.get(mv.bus === 1 ? 0 : mv.bus)!
    userGesture.current = true
    m.flyTo([b.lat, b.lon], Math.max(m.getZoom(), 18.5), { duration: 0.6 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  return (
    <div className={cx('relative', className)}>
      <div ref={el} className="absolute inset-0 z-0" role="application" aria-label="Campus distribution network map" />
      <div className="absolute right-3 top-3 z-[500] flex flex-col items-end gap-2">
        <div className="map-toolbar flex flex-wrap overflow-hidden rounded-sm border hair bg-s1 text-[12px] shadow-sm">
          {(['light', 'street', 'satellite', 'schematic'] as Basemap[]).map((b) => (
            <button key={b} onClick={() => { setTileNote(null); setBasemap(b) }} className={cx('focus-ring px-2.5 py-1.5 font-medium capitalize', basemap === b ? 'bg-navy text-onnavy' : 'text-ink2 hover:bg-s2')}>{b === 'light' ? 'Map' : b === 'street' ? 'Street' : b === 'satellite' ? 'Satellite' : 'Schematic'}</button>
          ))}
        </div>
        <button
          onClick={() => { userGesture.current = false; map.current?.flyToBounds(NETWORK_BOUNDS, { duration: 0.5 }) }}
          className="focus-ring flex items-center gap-1.5 rounded-sm border hair bg-s1 px-2.5 py-1.5 text-[12px] font-medium text-ink2 shadow-sm hover:bg-s2"
          title="Show the whole network"
        >
          <Icon name="my_location" size={15} />Fit network
        </button>
        {tileNote &&<div className="max-w-[240px] rounded-sm border hair bg-s1 px-2.5 py-1.5 text-[11.5px] text-ink2 shadow-sm">{tileNote}</div>}
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 z-[500] max-w-[calc(100%-24px)] rounded-sm border hair bg-s1/95 px-3 py-2 text-[11.5px] shadow-sm">
        <div className="mb-1 font-semibold text-ink">Legend</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-ink2 sm:grid-cols-3">
          <span className="flex items-center gap-1.5"><span className="h-[3px] w-5 bg-ok" />Estimated flow</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-bad" />Meter warning</span>
          <span className="flex items-center gap-1.5"><span className="h-[3px] w-5 border-t-[3px] border-dashed border-warn" />No data</span>
          <span className="flex items-center gap-1.5"><span className="h-[2px] w-5 bg-navy/50" />Not metered</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-ok" />Meter</span>
        </div>
      </div>
    </div>
  )
}
