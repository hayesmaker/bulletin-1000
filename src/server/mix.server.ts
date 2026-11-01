import { MIN_RAMP } from '#/composition/schedule'
import type { MusicCue, Schedule } from '#/composition/schedule'

// Builds the ffmpeg inputs and filter graph that mix an export's audio:
// a silent bed the length of the video, the music (offset, delayed to its
// start, with the same volume curve as the preview), each kept clip's audio
// and the splash jingle. Pure, so it can be tested without running ffmpeg.

export const SAMPLE_RATE = 48000

// The key for the built-in jingle's file in `files`.
export const BUILT_IN_JINGLE = 'built-in-jingle'

export interface AudioMix {
  // ffmpeg arguments for the audio inputs, in order.
  inputArgs: string[]
  filter: string
  // The filter graph's output label.
  output: string
}

const n = (x: number) => String(Number(x.toFixed(6)))

// musicGain() from the schedule, as an ffmpeg expression of t (seconds on
// the output timeline).
export function musicGainExpression(cue: MusicCue) {
  const terms = [n(cue.volume)]
  if (cue.fadeOut > 0) {
    terms.push(`clip((${n(cue.end)}-t)/${n(cue.fadeOut)},0,1)`)
  }
  const { level, windows } = cue.ducking
  const ramp = Math.max(cue.ducking.ramp, MIN_RAMP)
  if (windows.length > 0) {
    const depth = windows
      .map(
        (w) =>
          `clip(min((t-${n(w.start - ramp)})/${n(ramp)},(${n(w.end + ramp)}-t)/${n(ramp)}),0,1)`,
      )
      .reduce((a, b) => `max(${a},${b})`)
    terms.push(`(1-${n(1 - level)}*${depth})`)
  }
  return terms.join('*')
}

const normalise = `aresample=${SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS`
const delay = (seconds: number) =>
  `adelay=delays=${Math.round(seconds * 1000)}:all=1`

// `firstInput` is the ffmpeg input index the audio inputs start at (after
// the video). `files` maps asset ids to their media files.
export function buildAudioMix(
  schedule: Schedule,
  files: Map<string, string>,
  firstInput: number,
): AudioMix {
  const inputArgs = [
    '-f',
    'lavfi',
    '-t',
    n(schedule.duration),
    '-i',
    `anullsrc=r=${SAMPLE_RATE}:cl=stereo`,
  ]
  const chains: string[] = []
  const labels = [`[${firstInput}:a]`]
  let index = firstInput + 1

  const music = schedule.music
  const musicFile = music && files.get(music.assetId)
  if (music && musicFile) {
    inputArgs.push(
      '-ss',
      n(music.sourceOffset),
      '-t',
      n(music.end - music.start),
      '-i',
      musicFile,
    )
    chains.push(
      `[${index}:a]${normalise},${delay(music.start)},volume='${musicGainExpression(music)}':eval=frame[music]`,
    )
    labels.push('[music]')
    index++
  }

  for (const cue of schedule.clipAudio) {
    const file = files.get(cue.assetId)
    if (!file) continue
    inputArgs.push(
      '-ss',
      n(cue.trimIn),
      '-t',
      n(cue.end - cue.start),
      '-i',
      file,
    )
    const label = `[clip${chains.length}]`
    chains.push(`[${index}:a]${normalise},${delay(cue.start)}${label}`)
    labels.push(label)
    index++
  }

  const jingle = schedule.jingle
  const jingleFile = jingle && files.get(jingle.assetId ?? BUILT_IN_JINGLE)
  if (jingle && jingleFile) {
    inputArgs.push('-t', n(jingle.end - jingle.start), '-i', jingleFile)
    chains.push(`[${index}:a]${normalise},${delay(jingle.start)}[jingle]`)
    labels.push('[jingle]')
    index++
  }

  chains.push(
    `${labels.join('')}amix=inputs=${labels.length}:duration=first:normalize=0[audio]`,
  )
  return { inputArgs, filter: chains.join(';'), output: '[audio]' }
}
