import { describe, expect, it } from 'vitest'
import { DEFAULT_DUCKING, createProjectDoc } from '#/lib/project'
import type { ProjectDoc, Scene } from '#/lib/project'
import {
  VOICE_LINE_TAIL,
  buildSchedule,
  itemsAt,
  musicGain,
  narrationOverlaps,
  snapDown,
  toFrames,
} from './schedule'
import type { AssetInfo } from './schedule'

const clipId = crypto.randomUUID()
const silentClipId = crypto.randomUUID()
const tuneId = crypto.randomUUID()

const assets: AssetInfo[] = [
  { id: clipId, kind: 'video', duration: 20, hasAudio: true },
  { id: silentClipId, kind: 'video', duration: 20, hasAudio: false },
  { id: tuneId, kind: 'audio', duration: 60, hasAudio: true },
]

const card = (type: 'packshot', duration: number): Scene => ({
  id: crypto.randomUUID(),
  type,
  duration,
  transitionIn: { type: 'cut' },
  voiceLine: null,
  showTitle: false,
  rule: false,
  showBadge: true,
})

const gameplay = (overrides: Partial<Scene> = {}): Scene =>
  ({
    id: crypto.randomUUID(),
    type: 'gameplay',
    assetId: clipId,
    trimIn: 2,
    trimOut: 8,
    keepClipAudio: false,
    duckMusic: true,
    duckLevel: null,
    captions: [],
    transitionIn: { type: 'cut' },
    voiceLine: null,
    ...overrides,
  }) as Scene

const doc = (overrides: Partial<ProjectDoc>): ProjectDoc => ({
  ...createProjectDoc('Gyroscope'),
  ...overrides,
})

describe('buildSchedule', () => {
  it('lays scenes end to end with hard cuts', () => {
    const s = buildSchedule(
      doc({ scenes: [card('packshot', 4), gameplay(), card('packshot', 3)] }),
      assets,
    )
    expect(s.items.map((i) => [i.start, i.end])).toEqual([
      [0, 4],
      [4, 10],
      [10, 13],
    ])
    expect(s.duration).toBe(13)
  })

  it('snaps a clip length down to a whole frame', () => {
    expect(snapDown(8.0133)).toBe(8)
    expect(snapDown(4.04)).toBe(4.04)
  })

  it('puts the splash first', () => {
    const s = buildSchedule(
      doc({ splash: '1989', scenes: [card('packshot', 4)] }),
      assets,
    )
    expect(s.items[0]).toMatchObject({ kind: 'splash', start: 0, end: 7 })
    expect(s.items[1]).toMatchObject({ start: 7, end: 11 })
  })

  it('holds the splash for longer, in whole frames', () => {
    const s = buildSchedule(
      doc({ splash: '1985', splashHold: 1.5, scenes: [card('packshot', 4)] }),
      assets,
    )
    expect(s.items[0]).toMatchObject({ kind: 'splash', start: 0, end: 3.92 })
    expect(s.items[1]).toMatchObject({ start: 3.92, end: 7.92 })
  })

  it('keeps the jingle its own length under a held splash', () => {
    const s = buildSchedule(
      doc({ splash: '1989', splashHold: 2, scenes: [card('packshot', 4)] }),
      assets,
    )
    expect(s.items[0].end).toBe(9)
    expect(s.jingle).toMatchObject({ start: 0, end: 7 })
  })

  it('overlaps dissolves and caps them at half a scene', () => {
    const s = buildSchedule(
      doc({
        scenes: [
          card('packshot', 4),
          gameplay({ transitionIn: { type: 'dissolve', length: 0.5 } }),
          {
            ...card('packshot', 0.4),
            transitionIn: { type: 'dissolve', length: 0.5 },
          },
        ],
      }),
      assets,
    )
    expect(s.items[1]).toMatchObject({ start: 3.52, end: 9.52, overlap: 0.48 })
    expect(s.items[2]).toMatchObject({ start: 9.32, end: 9.72, overlap: 0.2 })
    expect(itemsAt(s, 3.6).map((i) => i.id)).toEqual([
      s.items[0].id,
      s.items[1].id,
    ])
  })

  it('ignores a dissolve on the first item', () => {
    const s = buildSchedule(
      doc({
        scenes: [gameplay({ transitionIn: { type: 'dissolve', length: 0.5 } })],
      }),
      assets,
    )
    expect(s.items[0]).toMatchObject({
      start: 0,
      overlap: 0,
      transition: { type: 'cut' },
    })
  })

  it('overlaps every transition but a cut by its own length', () => {
    const s = buildSchedule(
      doc({
        scenes: [
          card('packshot', 4),
          {
            ...card('packshot', 4),
            transitionIn: {
              type: 'wipe',
              length: 1,
              direction: 'left',
              soft: false,
            },
          },
          {
            ...card('packshot', 4),
            transitionIn: { type: 'spectrum-load', length: 3 },
          },
        ],
      }),
      assets,
    )
    expect(s.items[1]).toMatchObject({ start: 3, overlap: 1 })
    // Capped at half of either scene.
    expect(s.items[2]).toMatchObject({
      start: 5,
      overlap: 2,
      transition: { type: 'spectrum-load' },
    })
  })

  it('takes the first scene in from the splash with its transition', () => {
    const s = buildSchedule(
      doc({
        splash: '1985',
        scenes: [
          {
            ...card('packshot', 4),
            transitionIn: { type: 'dip', length: 0.8, colour: '#000000' },
          },
        ],
      }),
      assets,
    )
    expect(s.items[1]).toMatchObject({ start: 1.6, overlap: 0.8 })
  })

  it('snaps every time to whole frames', () => {
    const s = buildSchedule(
      doc({
        scenes: [
          card('packshot', 1.013),
          gameplay({ trimIn: 0.3, trimOut: 1.71 }),
        ],
      }),
      assets,
    )
    for (const item of s.items) {
      expect(toFrames(item.start) / 25).toBe(item.start)
      expect(toFrames(item.end) / 25).toBe(item.end)
    }
  })

  it('clamps gameplay to the clip length', () => {
    const s = buildSchedule(
      doc({ scenes: [gameplay({ trimIn: 15, trimOut: 30 })] }),
      assets,
    )
    expect(s.duration).toBe(5)
  })

  describe('music', () => {
    const scenes = [card('packshot', 4), gameplay(), card('packshot', 3)]

    it('starts with the first gameplay scene by default', () => {
      const s = buildSchedule(
        doc({
          scenes,
          music: {
            source: { type: 'upload', assetId: tuneId },
            sourceOffset: 5,
            startAt: { type: 'first-gameplay' },
            volume: 0.8,
            ducking: DEFAULT_DUCKING,
          },
        }),
        assets,
      )
      expect(s.music).toEqual({
        assetId: tuneId,
        start: 4,
        end: 13,
        sourceOffset: 5,
        volume: 0.8,
        fadeOut: 1.5,
        ducking: { ramp: DEFAULT_DUCKING.ramp, windows: [] },
      })
    })

    it('can start at a chosen scene, and ends when the audio runs out', () => {
      const s = buildSchedule(
        doc({
          scenes,
          music: {
            source: { type: 'clip', assetId: clipId },
            sourceOffset: 12,
            startAt: { type: 'scene', sceneId: scenes[0].id },
            volume: 1,
            ducking: DEFAULT_DUCKING,
          },
        }),
        assets,
      )
      expect(s.music).toMatchObject({ start: 0, end: 8 })
    })

    it('is null without a source or when the clip is silent', () => {
      expect(buildSchedule(doc({ scenes }), assets).music).toBeNull()
      const silent = buildSchedule(
        doc({
          scenes,
          music: {
            source: { type: 'clip', assetId: silentClipId },
            sourceOffset: 0,
            startAt: { type: 'first-gameplay' },
            volume: 1,
            ducking: DEFAULT_DUCKING,
          },
        }),
        assets,
      )
      expect(silent.music).toBeNull()
    })
  })

  it('cues clip audio only for scenes that keep it and have it', () => {
    const keep = gameplay({ keepClipAudio: true })
    const s = buildSchedule(
      doc({
        scenes: [
          gameplay(),
          keep,
          gameplay({ keepClipAudio: true, assetId: silentClipId }),
        ],
      }),
      assets,
    )
    expect(s.clipAudio).toEqual([
      {
        sceneId: keep.id,
        assetId: clipId,
        start: 6,
        end: 12,
        trimIn: 2,
        duckLevel: DEFAULT_DUCKING.level,
      },
    ])
  })

  describe('ducking', () => {
    const music = (ramp = 0.25): ProjectDoc['music'] => ({
      source: { type: 'upload', assetId: tuneId },
      sourceOffset: 0,
      startAt: { type: 'scene', sceneId: first.id },
      volume: 0.8,
      ducking: { level: 0.25, ramp },
    })
    const first = card('packshot', 4)

    it('ducks under clip audio, merging close windows', () => {
      const s = buildSchedule(
        doc({
          music: music(),
          scenes: [
            first,
            gameplay({ keepClipAudio: true }), // 4–10
            gameplay({ keepClipAudio: true }), // 10–16
            card('packshot', 4), // 16–20
            gameplay({ keepClipAudio: true, duckMusic: false }), // 20–26
          ],
        }),
        assets,
      )
      expect(s.music?.ducking.windows).toEqual([
        { start: 4, end: 16, level: 0.25 },
      ])
    })

    it('uses a scene’s own level, ramping between levels', () => {
      const s = buildSchedule(
        doc({
          music: music(0.5),
          scenes: [
            first,
            gameplay({ keepClipAudio: true }), // 4–10
            gameplay({ keepClipAudio: true, duckLevel: 0.5 }), // 10–16
            card('packshot', 4), // 16–20
            gameplay({ keepClipAudio: true, duckLevel: 1 }), // 20–26
          ],
        }),
        assets,
      )
      const cue = s.music!
      // A level of 1 doesn't duck.
      expect(cue.ducking.windows).toEqual([
        { start: 4, end: 10, level: 0.25 },
        { start: 10, end: 16, level: 0.5 },
      ])
      expect(musicGain(cue, 9)).toBeCloseTo(0.8 * 0.25)
      // On its way back up from the deeper level, until it meets the next.
      expect(musicGain(cue, 10.1)).toBeCloseTo(0.8 * 0.4)
      expect(musicGain(cue, 12)).toBeCloseTo(0.8 * 0.5)
      expect(musicGain(cue, 17)).toBeCloseTo(0.8)
    })

    it('stretches a window to meet a close one with another level', () => {
      const s = buildSchedule(
        doc({
          music: music(0.5),
          scenes: [
            first,
            gameplay({ keepClipAudio: true }), // 4–10
            card('packshot', 0.8), // 10–10.8
            gameplay({ keepClipAudio: true, duckLevel: 0.5 }), // 10.8–16.8
          ],
        }),
        assets,
      )
      expect(s.music?.ducking.windows).toEqual([
        { start: 4, end: 10.8, level: 0.25 },
        { start: 10.8, end: 16.8, level: 0.5 },
      ])
    })

    it('ramps the music down before clip audio and back up after', () => {
      const s = buildSchedule(
        doc({
          music: music(0.5),
          scenes: [
            first,
            gameplay({ keepClipAudio: true }),
            card('packshot', 4),
          ],
        }),
        assets,
      )
      const cue = s.music!
      expect(cue.ducking.windows).toEqual([{ start: 4, end: 10, level: 0.25 }])
      expect(musicGain(cue, 1)).toBeCloseTo(0.8)
      expect(musicGain(cue, 3.75)).toBeCloseTo(0.8 * 0.625)
      expect(musicGain(cue, 4)).toBeCloseTo(0.2)
      expect(musicGain(cue, 9)).toBeCloseTo(0.2)
      expect(musicGain(cue, 10.5)).toBeCloseTo(0.8)
      // Faded out over the last 1.5s.
      expect(musicGain(cue, 13.25)).toBeCloseTo(0.8 * 0.5)
      expect(musicGain(cue, 14)).toBe(0)
    })
  })

  describe('jingle', () => {
    const scenes = [card('packshot', 4)]

    it('plays the built-in jingle with the 1989 splash only', () => {
      expect(
        buildSchedule(doc({ splash: '1989', scenes }), assets).jingle,
      ).toEqual({ assetId: null, start: 0, end: 7 })
      expect(
        buildSchedule(doc({ splash: '1985', scenes }), assets).jingle,
      ).toBeNull()
      expect(buildSchedule(doc({ scenes }), assets).jingle).toBeNull()
    })

    it('plays an uploaded jingle for its length, with either splash', () => {
      const s = buildSchedule(
        doc({
          splash: '1985',
          splashJingle: { type: 'upload', assetId: tuneId },
          scenes,
        }),
        assets,
      )
      // The tune is 60s, so it is cut at the end of the video.
      expect(s.jingle).toEqual({ assetId: tuneId, start: 0, end: 6.4 })
    })

    it('is silent when turned off', () => {
      const s = buildSchedule(
        doc({ splash: '1989', splashJingle: { type: 'none' }, scenes }),
        assets,
      )
      expect(s.jingle).toBeNull()
    })
  })
})

describe('narration', () => {
  const clip = (text: string, duration: number, voiceId = 'v1') => ({
    id: 'a'.repeat(63) + String(Math.round(duration)),
    duration,
    text,
    voiceId,
    settings: null,
  })
  const withLine = (
    scene: Scene,
    text: string,
    duration: number,
    offset = 0.4,
    voiceId = 'v1',
  ): Scene => ({
    ...scene,
    voiceLine: {
      text,
      offset,
      voiceId: null,
      settings: null,
      clip: clip(text, duration, voiceId),
    },
  })
  const narrated = (scenes: Scene[], extra: Partial<ProjectDoc> = {}) =>
    doc({
      narration: { voiceId: 'v1', volume: 0.9, duckMusic: true },
      scenes,
      ...extra,
    })

  it('stretches a card to hold its line, plus a tail', () => {
    const s = buildSchedule(
      narrated([withLine(card('packshot', 2), 'Out now!', 3)]),
      assets,
    )
    // 0.4 + 3 + 0.5, rounded to a whole frame.
    expect(VOICE_LINE_TAIL).toBe(0.5)
    expect(s.duration).toBe(3.92)
    expect(s.narration).toEqual([
      {
        sceneId: s.items[0].id,
        clipId: expect.any(String),
        start: 0.4,
        end: 3.4,
      },
    ])
    expect(s.narrationVolume).toBe(0.9)
    // A short line leaves the card alone.
    const short = buildSchedule(
      narrated([withLine(card('packshot', 6), 'Hi', 1)]),
      assets,
    )
    expect(short.duration).toBe(6)
  })

  it('lets a line run on past a gameplay scene, and flags overlaps', () => {
    const play = withLine(gameplay(), 'A long line over the action', 8, 0.4)
    const next = withLine(card('packshot', 4), 'Out now', 1, 0)
    const s = buildSchedule(narrated([play, next]), assets)
    // Gameplay keeps its 6s; the line runs to 8.4s, into the packshot.
    expect(s.items.map((i) => [i.start, i.end])).toEqual([
      [0, 6],
      [6, 10],
    ])
    expect(s.narration.map((c) => [c.start, c.end])).toEqual([
      [0.4, 8.4],
      [6, 7],
    ])
    expect(narrationOverlaps(s)).toEqual([{ first: play.id, second: next.id }])
  })

  it('skips lines that need generating', () => {
    const line = withLine(card('packshot', 2), 'Old text', 3)
    const edited: Scene = {
      ...line,
      voiceLine: { ...line.voiceLine!, text: 'New text' },
    }
    const s = buildSchedule(narrated([edited]), assets)
    expect(s.narration).toEqual([])
    expect(s.duration).toBe(2)
    // Another voice makes it stale too.
    const otherVoice = buildSchedule(
      narrated([line], {
        narration: { voiceId: 'v2', volume: 1, duckMusic: true },
      }),
      assets,
    )
    expect(otherVoice.narration).toEqual([])
  })

  it('ducks the music under narration', () => {
    const scenes = [
      card('packshot', 4),
      withLine(card('packshot', 4), 'Line', 2, 0.4),
    ]
    const music: ProjectDoc['music'] = {
      source: { type: 'upload', assetId: tuneId },
      sourceOffset: 0,
      startAt: { type: 'scene', sceneId: scenes[0].id },
      volume: 1,
      ducking: { level: 0.4, ramp: 0.25 },
    }
    const s = buildSchedule(narrated(scenes, { music }), assets)
    expect(s.music?.ducking.windows).toEqual([
      { start: 4.4, end: 6.4, level: 0.4 },
    ])
    const off = buildSchedule(
      narrated(scenes, {
        music,
        narration: { voiceId: 'v1', volume: 1, duckMusic: false },
      }),
      assets,
    )
    expect(off.music?.ducking.windows).toEqual([])
  })
})
