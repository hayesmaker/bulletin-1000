import { useEffect, useRef, useState } from 'react'
import { Button } from 'antd'
import { CaretRightFilled, PauseOutlined } from '@ant-design/icons'

// A play/stop button for a short sound, e.g. a voice line or voice sample.
export function PlayAudioButton({
  src,
  label,
}: {
  src: string
  label: string
}) {
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  useEffect(() => {
    const el = audio.current
    return () => el?.pause()
  }, [])
  return (
    <>
      <audio
        ref={audio}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <Button
        aria-label={playing ? `Stop ${label}` : `Play ${label}`}
        icon={playing ? <PauseOutlined /> : <CaretRightFilled />}
        onClick={() => {
          const el = audio.current
          if (!el) return
          if (playing) el.pause()
          else {
            el.currentTime = 0
            void el.play()
          }
        }}
      />
    </>
  )
}
