import { useEffect, useRef, useState } from 'react'
import { IconPause, IconPlay } from './ui/icons'
import { fmtTime, Segmented } from './ui/ui'

export function usePlayback(length: number, stepMsAtSpeed1 = 700) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<'1' | '4' | '12'>('4')
  const lenRef = useRef(length)
  lenRef.current = length
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      setIndex((i) => {
        if (i >= lenRef.current - 1) { setPlaying(false); return i }
        return i + 1
      })
    }, stepMsAtSpeed1 / Number(speed))
    return () => clearInterval(id)
  }, [playing, speed, stepMsAtSpeed1])
  useEffect(() => { setIndex((i) => Math.min(i, Math.max(0, length - 1))) }, [length])
  return { index, setIndex, playing, setPlaying, speed, setSpeed }
}

export function PlaybackBar({ pb, times, label = 'Replay', format }: { pb: ReturnType<typeof usePlayback>; times: number[]; label?: string; format?: (t: number) => string }) {
  const n = times.length
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-pc/30 bg-pc/[0.06] p-3 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
        <button onClick={() => { if (pb.index >= n - 1) pb.setIndex(0); pb.setPlaying(!pb.playing) }} aria-label={pb.playing ? 'Pause' : 'Play'}
          className="focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-bg active:scale-95">
          {pb.playing ? <IconPause width={16} height={16} /> : <IconPlay width={16} height={16} />}
        </button>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold tracking-[0.1em] text-pc">{label.toUpperCase()}</div>
          <div className="num truncate text-[13px] font-medium">{n ? (format ? format(times[pb.index]) : fmtTime(times[pb.index], true)) : '—'}</div>
        </div>
      </div>
      <input aria-label="Playback position" type="range" min={0} max={Math.max(0, n - 1)} step={1} value={pb.index} onChange={(e) => { pb.setPlaying(false); pb.setIndex(Number(e.target.value)) }} className="flex-1" />
      <Segmented size="sm" label="Playback speed" value={pb.speed} onChange={pb.setSpeed} options={[{ value: '1', label: '1×' }, { value: '4', label: '4×' }, { value: '12', label: '12×' }]} />
    </div>
  )
}
