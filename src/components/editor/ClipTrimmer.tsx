import { useEffect, useRef, useState } from 'react'
import { Button, Slider } from 'antd'
import { CaretRightFilled, PauseOutlined } from '@ant-design/icons'
import { mediaUrl } from '#/lib/assets'
import { snap, snapDown } from '#/composition/schedule'
import { fps } from '#/composition/theme'
import type { AssetRow } from '#/server/db/schema'
import { formatSeconds, formatTime } from './labels'

interface Props {
  asset: AssetRow
  trimIn: number
  trimOut: number
  onChange: (trim: { trimIn: number; trimOut: number }) => void
}

const FRAME = 1 / fps

// Sets a gameplay scene's in and out points on its source clip. This is an
// editing aid, not the composition, so it plays in real time.
export function ClipTrimmer({ asset, trimIn, trimOut, onChange }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [current, setCurrent] = useState(trimIn)
  const [playing, setPlaying] = useState(false)
  const duration = snapDown(asset.metadata.duration ?? trimOut)

  const seek = (t: number) => {
    const video = videoRef.current
    if (video) video.currentTime = t
    setCurrent(t)
  }

  // Play the trimmed range, stopping at the out point.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !playing) return
    let raf = 0
    const tick = () => {
      setCurrent(video.currentTime)
      if (video.currentTime >= trimOut || video.ended) {
        video.pause()
        setPlaying(false)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    if (video.currentTime < trimIn || video.currentTime >= trimOut) {
      video.currentTime = trimIn
    }
    void video.play().then(
      () => (raf = requestAnimationFrame(tick)),
      () => setPlaying(false),
    )
    return () => {
      cancelAnimationFrame(raf)
      video.pause()
    }
  }, [playing, trimIn, trimOut])

  const setIn = (t: number) =>
    onChange({ trimIn: snap(Math.min(t, trimOut - FRAME)), trimOut })
  const setOut = (t: number) =>
    onChange({ trimIn, trimOut: snap(Math.max(t, trimIn + FRAME)) })

  return (
    <div className="flex flex-col gap-2">
      <video
        ref={videoRef}
        src={mediaUrl(asset.id)}
        muted
        playsInline
        preload="auto"
        className="aspect-[4/3] w-full bg-black object-contain"
        style={{ imageRendering: 'pixelated' }}
        onLoadedMetadata={() => seek(trimIn)}
      />
      <Slider
        range
        min={0}
        max={duration}
        step={FRAME}
        value={[trimIn, trimOut]}
        tooltip={{ formatter: (v) => formatTime(v ?? 0) }}
        onChange={([a, b]) => {
          setPlaying(false)
          if (a !== trimIn) seek(a)
          else if (b !== trimOut) seek(b)
          onChange({
            trimIn: snap(a),
            trimOut: snap(Math.max(b, a + FRAME)),
          })
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          shape="circle"
          aria-label={playing ? 'Pause' : 'Play trimmed clip'}
          icon={playing ? <PauseOutlined /> : <CaretRightFilled />}
          onClick={() => setPlaying((p) => !p)}
        />
        <Button size="small" onClick={() => setIn(current)}>
          Set in
        </Button>
        <Button size="small" onClick={() => setOut(current)}>
          Set out
        </Button>
        <span className="ml-auto font-mono text-xs tabular-nums text-neutral-500">
          {formatTime(current)} · length {formatSeconds(trimOut - trimIn)}
        </span>
      </div>
      <Slider
        min={0}
        max={duration}
        step={FRAME}
        value={current}
        tooltip={{ formatter: (v) => formatTime(v ?? 0) }}
        onChange={(t) => {
          setPlaying(false)
          seek(t)
        }}
        aria-label="Scrub clip"
      />
    </div>
  )
}
