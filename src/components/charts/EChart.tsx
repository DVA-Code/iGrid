import { BarChart, CustomChart, LineChart, ScatterChart } from 'echarts/charts'
import {
  DataZoomComponent, GridComponent, LegendComponent, MarkAreaComponent, MarkLineComponent,
  MarkPointComponent, TooltipComponent, VisualMapComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'

echarts.use([
  LineChart, BarChart, ScatterChart, CustomChart, GridComponent, TooltipComponent, LegendComponent,
  MarkLineComponent, MarkAreaComponent, MarkPointComponent, DataZoomComponent, VisualMapComponent, CanvasRenderer,
])

export type EOption = echarts.EChartsCoreOption

/** Reads design tokens so charts match both themes. */
export function useChartTheme() {
  const theme = useStore((s) => s.theme)
  const [t, setT] = useState(() => readTheme())
  useEffect(() => { setT(readTheme()) }, [theme])
  return t
}

function readTheme() {
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string) => `rgb(${cs.getPropertyValue(n).trim().split(' ').join(',')})`
  const a = (n: string, al: number) => `rgba(${cs.getPropertyValue(n).trim().split(' ').join(',')},${al})`
  return {
    ink: v('--ink'), ink2: v('--ink2'), ink3: v('--ink3'), s1: v('--s1'), s2: v('--s2'),
    line: a('--line', 0.08), lineStrong: a('--line', 0.16),
    pa: v('--pa'), pb: v('--pb'), pc: v('--pc'), steel: v('--steel'), teal: v('--teal'), sun: v('--sun'), ember: v('--ember'),
    alpha: a,
  }
}

export type ChartTheme = ReturnType<typeof readTheme>

export function baseOption(t: ChartTheme): EOption {
  return {
    animationDuration: 700,
    animationDurationUpdate: 500,
    animationEasing: 'cubicOut',
    animationEasingUpdate: 'cubicOut',
    textStyle: { fontFamily: '"Segoe UI", Arial, sans-serif', color: t.ink2 },
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: t.s1,
      borderColor: t.lineStrong,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: t.ink, fontSize: 12 },
      extraCssText: 'box-shadow:0 12px 32px -12px rgba(0,0,0,.45);border-radius:10px;',
      axisPointer: { type: 'line', lineStyle: { color: t.lineStrong, width: 1 } },
      confine: true,
    },
    xAxis: { axisLine: { lineStyle: { color: t.lineStrong } }, axisTick: { show: false }, axisLabel: { color: t.ink3, fontSize: 11, hideOverlap: true }, splitLine: { show: false } },
    yAxis: { axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: t.ink3, fontSize: 11 }, splitLine: { lineStyle: { color: t.line } }, nameTextStyle: { color: t.ink3, fontSize: 11, align: 'left' } },
  }
}

export function EChart({ option, height = 280, className, onClick, ariaLabel }: { option: EOption; height?: number | string; className?: string; onClick?: (p: unknown) => void; ariaLabel: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)
  const reduced = useStore((s) => s.reducedMotion)

  useEffect(() => {
    if (!ref.current) return
    const c = echarts.init(ref.current, undefined, { renderer: 'canvas' })
    chart.current = c
    const ro = new ResizeObserver(() => {if(!c.isDisposed())c.resize()})
    ro.observe(ref.current)
    return () => { ro.disconnect(); c.dispose(); chart.current = null }
  }, [])

  useEffect(() => {
    chart.current?.setOption({ ...option, animation: !reduced && (option as { animation?: boolean }).animation !== false }, { notMerge: true, lazyUpdate: true })
  }, [option, reduced])

  useEffect(() => {
    const c = chart.current
    if (!c || !onClick) return
    c.on('click', onClick)
    return () => { c.off('click', onClick) }
  }, [onClick])

  return <div ref={ref} role="img" aria-label={ariaLabel} className={className} style={{ height, width: '100%' }} />
}
