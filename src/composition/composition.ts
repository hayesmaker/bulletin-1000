import { gsap } from 'gsap'
import { BUILT_IN_JINGLE_URL } from '#/lib/assets'
import type { ProjectDoc } from '#/lib/project'
import { buildSchedule, musicGain } from './schedule'
import type { Schedule } from './schedule'
import { buildLayer } from './scenes'
import { splashFontFaces } from './splash'
import type { CaptionCue, CompositionAsset, VideoCue } from './scenes'
import { colours, fonts, layout, stage } from './theme'

// Builds the Bulletin 1000 video for a project: a fixed 1440×1080 stage of
// DOM layers driven by a paused GSAP timeline. The timeline is the only
// clock: callers move it with seek() (preview) or renderFrame() (export),
// so the same time always produces the same picture.

export type { CompositionAsset } from './scenes'

export interface Composition {
  schedule: Schedule
  duration: number
  frameCount: number
  stage: HTMLElement
  // Resolves when fonts, images and video metadata have loaded.
  ready: Promise<void>
  seek: (t: number) => void
  // Preview only: keeps video and audio elements in step with time t.
  syncMedia: (t: number, playing: boolean) => void
  // Export: shows frame n exactly, waiting for videos to seek.
  renderFrame: (frame: number) => Promise<void>
  destroy: () => void
}

// Drift allowed before a playing element is re-seeked, in seconds.
const PLAYING_DRIFT = 0.25
const PAUSED_DRIFT = 0.5 / stage.fps
const SEEK_TIMEOUT_MS = 15_000

function whenLoaded(target: HTMLElement, ok: string) {
  return new Promise<void>((resolve) => {
    target.addEventListener(ok, () => resolve(), { once: true })
    target.addEventListener('error', () => resolve(), { once: true })
  })
}

// Seeks a video and waits for the frame. Rejects if the video can't load,
// so an export fails loudly instead of hanging. The timer is only a failure
// guard; it never affects what is drawn.
function seekVideo(video: HTMLVideoElement, time: number) {
  const failed = () =>
    new Error(`Video failed to load: ${video.currentSrc || video.src}`)
  if (video.error) return Promise.reject(failed())
  const settled = Math.abs(video.currentTime - time) < 1e-3
  if (settled && !video.seeking && video.readyState >= 2) {
    return Promise.resolve()
  }
  return new Promise<void>((resolve, reject) => {
    const done = (error?: Error) => {
      clearTimeout(timer)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
      if (error) reject(error)
      else resolve()
    }
    const onSeeked = () => done()
    const onError = () => done(failed())
    const timer = setTimeout(
      () => done(new Error(`Timed out seeking video: ${video.src}`)),
      SEEK_TIMEOUT_MS,
    )
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('error', onError)
    video.currentTime = time
  })
}

export function createComposition(
  root: HTMLElement,
  doc: ProjectDoc,
  assetList: CompositionAsset[],
): Composition {
  const assets = new Map(assetList.map((a) => [a.id, a]))
  const schedule = buildSchedule(doc, assetList)

  const stageEl = document.createElement('div')
  Object.assign(stageEl.style, {
    position: 'relative',
    width: `${stage.width}px`,
    height: `${stage.height}px`,
    overflow: 'hidden',
    background: colours.background,
    fontFamily: fonts.sans,
  })
  root.replaceChildren(stageEl)

  const tl = gsap.timeline({ paused: true })
  const captions: CaptionCue[] = []
  const videos: VideoCue[] = []
  const images: HTMLImageElement[] = []

  for (const item of schedule.items) {
    const built = buildLayer(item, doc, assets)
    stageEl.append(built.layer)
    captions.push(...built.captions)
    images.push(...built.images)
    if (built.video) videos.push(built.video)
    built.animate?.(tl, item.start)

    if (item.dissolve > 0) {
      tl.fromTo(
        built.layer,
        { autoAlpha: 0 },
        {
          autoAlpha: 1,
          duration: item.dissolve,
          ease: 'none',
          immediateRender: false,
        },
        item.start,
      )
    } else {
      tl.set(built.layer, { autoAlpha: 1 }, item.start)
    }
    tl.set(built.layer, { autoAlpha: 0 }, item.end)
  }
  for (const c of captions) {
    tl.set(c.el, { autoAlpha: 1 }, c.start)
    tl.set(c.el, { autoAlpha: 0 }, c.end)
  }
  // A fresh paused timeline doesn't render zero-length tweens at time 0, so
  // frame 0 would be blank. Play through once and back to apply them.
  tl.seek(tl.duration(), false).seek(0, false)

  const music = schedule.music
    ? new Audio(assets.get(schedule.music.assetId)?.url)
    : null
  if (music) music.preload = 'auto'
  const jingleCue = schedule.jingle
  const jingle = jingleCue
    ? new Audio(
        jingleCue.assetId
          ? assets.get(jingleCue.assetId)?.url
          : BUILT_IN_JINGLE_URL,
      )
    : null
  if (jingle) jingle.preload = 'auto'

  // Keeps an audio element playing in step with time t.
  const syncAudio = (
    el: HTMLAudioElement,
    cue: { start: number; end: number },
    offset: number,
    t: number,
    playing: boolean,
  ) => {
    if (t < cue.start || t >= cue.end || !playing) {
      if (!el.paused) el.pause()
      return
    }
    const desired = offset + (t - cue.start)
    if (Math.abs(el.currentTime - desired) > PLAYING_DRIFT) {
      el.currentTime = desired
    }
    if (el.paused) void el.play().catch(() => undefined)
  }

  const fontFaces = [
    `${layout.caption.fontWeight} ${layout.caption.fontSize}px ${fonts.sans}`,
    `${layout.packshot.priceFontWeight} ${layout.packshot.priceFontSize}px ${fonts.sans}`,
    `${layout.packshot.platformFontWeight} ${layout.packshot.platformFontSize}px ${fonts.sans}`,
    `${layout.overlayCaption.fontWeight} ${layout.overlayCaption.fontSize}px ${fonts.sans}`,
    ...splashFontFaces,
  ]
  const ready = Promise.all([
    ...fontFaces.map((f) => document.fonts.load(f).catch(() => [])),
    ...images.map((img) => img.decode().catch(() => undefined)),
    ...videos.map((v) =>
      v.el.readyState >= 1 ? undefined : whenLoaded(v.el, 'loadedmetadata'),
    ),
  ]).then(() => document.fonts.ready.then(() => undefined))

  const clampTime = (t: number) =>
    Math.min(Math.max(t, 0), Math.max(schedule.duration - 1e-6, 0))

  const seek = (t: number) => {
    tl.seek(clampTime(t), false)
  }

  const syncMedia = (t: number, playing: boolean) => {
    for (const v of videos) {
      const active = t >= v.start && t < v.end
      v.el.muted = !v.keepClipAudio
      if (!active) {
        if (!v.el.paused) v.el.pause()
        continue
      }
      const desired = v.trimIn + (t - v.start)
      const drift = Math.abs(v.el.currentTime - desired)
      if (playing) {
        if (drift > PLAYING_DRIFT) v.el.currentTime = desired
        if (v.el.paused) void v.el.play().catch(() => undefined)
      } else {
        if (!v.el.paused) v.el.pause()
        if (drift > PAUSED_DRIFT) v.el.currentTime = desired
      }
    }

    const cue = schedule.music
    if (music && cue) {
      syncAudio(music, cue, cue.sourceOffset, t, playing)
      music.volume = Math.max(0, Math.min(1, musicGain(cue, t)))
    }
    if (jingle && jingleCue) syncAudio(jingle, jingleCue, 0, t, playing)
  }

  const renderFrame = async (frame: number) => {
    const t = frame / stage.fps
    seek(t)
    await Promise.all(
      videos
        .filter((v) => t >= v.start && t < v.end)
        // A hair past the frame time, so float error can't land on the
        // previous frame.
        .map((v) => seekVideo(v.el, v.trimIn + (t - v.start) + 1e-3)),
    )
  }

  const destroy = () => {
    tl.kill()
    for (const v of videos) {
      v.el.pause()
      v.el.removeAttribute('src')
      v.el.load()
    }
    music?.pause()
    jingle?.pause()
    stageEl.remove()
  }

  return {
    schedule,
    duration: schedule.duration,
    frameCount: Math.round(schedule.duration * stage.fps),
    stage: stageEl,
    ready,
    seek,
    syncMedia,
    renderFrame,
    destroy,
  }
}
