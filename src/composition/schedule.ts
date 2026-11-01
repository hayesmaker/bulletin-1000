import type { ProjectDoc, Scene } from '#/lib/project'
import { stage, timing } from './theme'

// Turns a project doc into absolute times: when each scene starts and ends,
// how long each dissolve lasts, and when the music and clip audio play.
// Pure and deterministic; every time is a whole number of frames.

export interface AssetInfo {
  id: string
  kind: 'video' | 'image' | 'audio'
  duration?: number
  hasAudio?: boolean
}

export interface SplashItem {
  kind: 'splash'
  id: 'splash'
  splash: '1985' | '1989'
}

export interface SceneItem {
  kind: 'scene'
  id: string
  scene: Scene
}

export type ScheduledItem = (SplashItem | SceneItem) & {
  start: number
  end: number
  // Seconds of fade-in over the previous item (0 for a cut).
  dissolve: number
}

export interface MusicCue {
  assetId: string
  start: number
  end: number
  // Position in the source audio at `start`.
  sourceOffset: number
  volume: number
  fadeOut: number
  // The music drops to the window's `level` × volume during each window,
  // fading down over `ramp` seconds before it and back up after it.
  ducking: { ramp: number; windows: DuckWindow[] }
}

export interface DuckWindow {
  start: number
  end: number
  level: number
}

export interface ClipAudioCue {
  sceneId: string
  assetId: string
  start: number
  end: number
  // Position in the clip at `start`.
  trimIn: number
  // The music level under this clip, or null to leave the music alone.
  duckLevel: number | null
}

// The splash sound. A null assetId is the built-in 1989 jingle.
export interface JingleCue {
  assetId: string | null
  start: number
  end: number
}

export interface Schedule {
  items: ScheduledItem[]
  duration: number
  music: MusicCue | null
  clipAudio: ClipAudioCue[]
  jingle: JingleCue | null
}

export const toFrames = (seconds: number) => Math.round(seconds * stage.fps)
export const snap = (seconds: number) => toFrames(seconds) / stage.fps
// The last whole frame at or before a time, e.g. a clip's usable length.
export const snapDown = (seconds: number) =>
  Math.floor(seconds * stage.fps + 1e-6) / stage.fps

function sceneDuration(scene: Scene, assets: Map<string, AssetInfo>) {
  if (scene.type !== 'gameplay') return scene.duration
  const clip = scene.assetId ? assets.get(scene.assetId) : undefined
  const trimOut = clip?.duration
    ? Math.min(scene.trimOut, clip.duration)
    : scene.trimOut
  return Math.max(trimOut - scene.trimIn, 1 / stage.fps)
}

export function buildSchedule(
  doc: ProjectDoc,
  assetList: AssetInfo[],
): Schedule {
  const assets = new Map(assetList.map((a) => [a.id, a]))
  const entries: Array<{
    item: SplashItem | SceneItem
    length: number
    transition: 'cut' | 'dissolve'
  }> = []

  if (doc.splash !== 'none') {
    entries.push({
      item: { kind: 'splash', id: 'splash', splash: doc.splash },
      length: timing.splash[doc.splash],
      transition: 'cut',
    })
  }
  for (const scene of doc.scenes) {
    entries.push({
      item: { kind: 'scene', id: scene.id, scene },
      length: sceneDuration(scene, assets),
      transition: scene.transitionIn,
    })
  }

  const items: ScheduledItem[] = []
  let cursor = 0
  for (const entry of entries) {
    const length = snap(entry.length)
    const previous = items.at(-1)
    let dissolve = 0
    if (previous && entry.transition === 'dissolve') {
      const previousLength = previous.end - previous.start
      // Rounded down to whole frames so it never exceeds its cap.
      const cap = Math.min(timing.dissolve, previousLength / 2, length / 2)
      dissolve = Math.floor(cap * stage.fps + 1e-9) / stage.fps
    }
    const start = snap(cursor - dissolve)
    const end = snap(start + length)
    items.push({ ...entry.item, start, end, dissolve })
    cursor = end
  }
  const duration = items.at(-1)?.end ?? 0

  const clipAudio = clipAudioCues(items, assets, doc.music.ducking.level)
  return {
    items,
    duration,
    music: musicCue(doc, items, assets, duration, clipAudio),
    clipAudio,
    jingle: jingleCue(doc, items, assets, duration),
  }
}

function musicCue(
  doc: ProjectDoc,
  items: ScheduledItem[],
  assets: Map<string, AssetInfo>,
  duration: number,
  clipAudio: ClipAudioCue[],
): MusicCue | null {
  const { music } = doc
  const { startAt } = music
  if (music.source.type === 'none') return null
  const asset = assets.get(music.source.assetId)
  if (!asset?.duration || (music.source.type === 'clip' && !asset.hasAudio)) {
    return null
  }

  const firstGameplay = items.find(
    (i) => i.kind === 'scene' && i.scene.type === 'gameplay',
  )
  const chosen =
    startAt.type === 'scene'
      ? items.find((i) => i.id === startAt.sceneId)
      : undefined
  const start = (chosen ?? firstGameplay)?.start ?? 0

  const available = asset.duration - music.sourceOffset
  const end = snap(Math.min(duration, start + available))
  if (end <= start) return null
  return {
    assetId: asset.id,
    start,
    end,
    sourceOffset: music.sourceOffset,
    volume: music.volume,
    fadeOut: Math.min(timing.musicFadeOut, end - start),
    ducking: {
      ramp: music.ducking.ramp,
      windows: duckWindows(clipAudio, music.ducking.ramp),
    },
  }
}

function jingleCue(
  doc: ProjectDoc,
  items: ScheduledItem[],
  assets: Map<string, AssetInfo>,
  duration: number,
): JingleCue | null {
  const splash = items.find(
    (i): i is ScheduledItem & SplashItem => i.kind === 'splash',
  )
  if (!splash) return null
  const source = doc.splashJingle
  let length: number | undefined
  let assetId: string | null = null
  if (source.type === 'built-in') {
    // The 1985 splash is silent, like the original.
    if (splash.splash !== '1989') return null
    length = timing.builtInJingle
  } else if (source.type === 'upload') {
    const asset = assets.get(source.assetId)
    if (!asset?.hasAudio) return null
    length = asset.duration
    assetId = asset.id
  }
  if (!length) return null
  return {
    assetId,
    start: splash.start,
    end: snap(Math.min(splash.start + length, duration)),
  }
}

// Clip audio windows that duck the music. Windows closer together than the
// ramp in and out are joined, so the music doesn't bob up between them:
// merged when their levels match, otherwise the earlier one is stretched to
// meet the next, and the music ramps from one level to the other.
function duckWindows(clipAudio: ClipAudioCue[], ramp: number): DuckWindow[] {
  const windows: DuckWindow[] = []
  // Cues are already in timeline order.
  for (const { start, end, duckLevel: level } of clipAudio) {
    if (level === null || level >= 1) continue
    const last = windows.at(-1)
    if (last && start <= last.end + 2 * ramp) {
      if (last.level === level) {
        last.end = Math.max(last.end, end)
        continue
      }
      last.end = Math.max(last.end, start)
    }
    windows.push({ start, end, level })
  }
  return windows
}

// The music's volume at time t: its set volume, ducked under clip audio and
// faded out at the end. The exporter renders the same curve with ffmpeg
// (see musicGainExpression in the export code).
export function musicGain(cue: MusicCue, t: number) {
  if (t < cue.start || t >= cue.end) return 0
  const fade =
    cue.fadeOut > 0 ? Math.min(1, Math.max(0, (cue.end - t) / cue.fadeOut)) : 1
  const ramp = Math.max(cue.ducking.ramp, MIN_RAMP)
  // Each window pulls the music towards its level; the lowest pull wins.
  let duck = 1
  for (const w of cue.ducking.windows) {
    const rise = (t - (w.start - ramp)) / ramp
    const fall = (w.end + ramp - t) / ramp
    const depth = Math.min(1, Math.max(0, Math.min(rise, fall)))
    duck = Math.min(duck, 1 - (1 - w.level) * depth)
  }
  return cue.volume * fade * duck
}

// A zero ramp is treated as a very short one, so the curve stays continuous.
export const MIN_RAMP = 0.01

function clipAudioCues(
  items: ScheduledItem[],
  assets: Map<string, AssetInfo>,
  projectDuckLevel: number,
): ClipAudioCue[] {
  return items.flatMap((item) => {
    if (item.kind !== 'scene' || item.scene.type !== 'gameplay') return []
    const { scene } = item
    if (!scene.keepClipAudio || !scene.assetId) return []
    if (!assets.get(scene.assetId)?.hasAudio) return []
    return [
      {
        sceneId: scene.id,
        assetId: scene.assetId,
        start: item.start,
        end: item.end,
        trimIn: scene.trimIn,
        duckLevel: scene.duckMusic
          ? (scene.duckLevel ?? projectDuckLevel)
          : null,
      },
    ]
  })
}

// The items visible at time t, in stacking order (later items on top).
export function itemsAt(schedule: Schedule, t: number) {
  return schedule.items.filter((i) => t >= i.start && t < i.end)
}
