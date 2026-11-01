import { useEffect, useRef, useState } from 'react'
import { Button, Slider } from 'antd'
import { CaretRightFilled, PauseOutlined } from '@ant-design/icons'
import { createComposition } from '#/composition/composition'
import type { Composition, CompositionAsset } from '#/composition/composition'
import { stage } from '#/composition/theme'
import type { ProjectDoc } from '#/lib/project'

function formatTime(t: number) {
  const minutes = Math.floor(t / 60)
  const seconds = Math.floor(t % 60)
  const frames = Math.floor((t * stage.fps) % stage.fps)
  return `${minutes}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`
}

// Asks the player to jump to the start of a scene. A new request object
// jumps again, even to the same scene.
export interface SceneSeek {
  sceneId: string
}

interface Props {
  doc: ProjectDoc
  assets: CompositionAsset[]
  seekTo?: SceneSeek
}

// Scaled-down live preview. The composition itself is time-driven; this
// player is the clock, advancing time from requestAnimationFrame.
export function CompositionPlayer({ doc, assets, seekTo }: Props) {
  const frameRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const [composition, setComposition] = useState<Composition | null>(null)
  const [scale, setScale] = useState(0)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const handledSeek = useRef<SceneSeek>(undefined)

  useEffect(() => {
    if (!hostRef.current) return
    const c = createComposition(hostRef.current, doc, assets)
    setComposition(c)
    setPlaying(false)
    setTime((t) => Math.min(t, c.duration))
    return () => c.destroy()
  }, [doc, assets])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const observer = new ResizeObserver(([entry]) =>
      setScale(entry.contentRect.width / stage.width),
    )
    observer.observe(frame)
    return () => observer.disconnect()
  }, [])

  // Jump to the start of a scene. The preview lags edits a little, so a new scene
  // may only appear in a later composition; the jump happens once it does.
  useEffect(() => {
    if (!composition || !seekTo || handledSeek.current === seekTo) return
    const item = composition.schedule.items.find((i) => i.id === seekTo.sceneId)
    if (!item) return
    handledSeek.current = seekTo
    setPlaying(false)
    // After any dissolve, so the scene is fully shown.
    setTime(item.start + item.dissolve)
  }, [composition, seekTo])

  // Paused: show the current time.
  useEffect(() => {
    if (!composition || playing) return
    composition.seek(time)
    composition.syncMedia(time, false)
  }, [composition, playing, time])

  // Playing: advance time with the display.
  useEffect(() => {
    if (!composition || !playing) return
    const startTime = time >= composition.duration ? 0 : time
    const startedAt = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = startTime + (now - startedAt) / 1000
      if (t >= composition.duration) {
        setTime(composition.duration)
        setPlaying(false)
        return
      }
      composition.seek(t)
      composition.syncMedia(t, true)
      setTime(t)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      composition.syncMedia(composition.duration, false)
    }
    // Restart only when play state or composition changes, not every tick.
  }, [composition, playing])

  const duration = composition?.duration ?? 0

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={frameRef}
        className="relative w-full overflow-hidden bg-black"
        style={{ aspectRatio: `${stage.width} / ${stage.height}` }}
      >
        <div
          ref={hostRef}
          style={{
            width: stage.width,
            height: stage.height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button
          shape="circle"
          aria-label={playing ? 'Pause' : 'Play'}
          icon={playing ? <PauseOutlined /> : <CaretRightFilled />}
          disabled={!composition || duration === 0}
          onClick={() => setPlaying((p) => !p)}
        />
        <Slider
          className="flex-1"
          min={0}
          max={duration}
          step={1 / stage.fps}
          value={time}
          tooltip={{ formatter: (v) => formatTime(v ?? 0) }}
          onChange={(v) => {
            setPlaying(false)
            setTime(v)
          }}
        />
        <span className="font-mono text-sm tabular-nums">
          {formatTime(time)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  )
}
