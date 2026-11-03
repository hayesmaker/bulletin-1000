import { z } from 'zod'

// The project document: everything needed to rebuild a video, stored as JSON
// so projects stay re-editable. Shared by the editor, the composition and the
// server. Times are in seconds.

export const PROJECT_DOC_VERSION = 1

const id = z.uuid()
const seconds = z.number().nonnegative()

export const hexColour = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Expected a hex colour like #1a2b3c')

export const pricePlatformSchema = z.object({
  platform: z.string().max(60),
  price: z.string().max(30),
})

export const captionSchema = z
  .object({
    id,
    text: z.string().max(200),
    start: seconds,
    end: seconds,
  })
  .refine((c) => c.end > c.start, {
    message: 'Caption must end after it starts',
    path: ['end'],
  })

export const transitionSchema = z.enum(['cut', 'dissolve'])

// ElevenLabs voice ids, and the stand-in's.
export const voiceIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)
// A generated voice clip: a sha256 of what it was made from (see
// src/server/tts.server.ts).
export const voiceClipIdSchema = z.string().regex(/^[0-9a-f]{64}$/)

export const MAX_VOICE_LINE_LENGTH = 500
export const DEFAULT_VOICE_LINE_OFFSET = 0.4

// How a line is read. ElevenLabs' own defaults; speed runs from 0.7
// (slowest) to 1.2.
export const voiceSettingsSchema = z.object({
  speed: z.number().min(0.7).max(1.2),
  stability: z.number().min(0).max(1),
  similarity: z.number().min(0).max(1),
  style: z.number().min(0).max(1),
})
export const DEFAULT_VOICE_SETTINGS = {
  speed: 1,
  stability: 0.5,
  similarity: 0.75,
  style: 0,
}

// Narration spoken over a scene, starting `offset` seconds into it. A line
// can use its own voice and settings; null means the project's voice and
// the voice's own settings. `clip` is the generated audio and what it was
// made from; the line needs generating again when any of that has changed.
export const voiceLineSchema = z.object({
  text: z.string().max(MAX_VOICE_LINE_LENGTH),
  offset: seconds.max(30).default(DEFAULT_VOICE_LINE_OFFSET),
  voiceId: voiceIdSchema.nullable().default(null),
  settings: voiceSettingsSchema.nullable().default(null),
  clip: z
    .object({
      id: voiceClipIdSchema,
      duration: z.number().positive(),
      text: z.string(),
      voiceId: voiceIdSchema,
      settings: voiceSettingsSchema.nullable().default(null),
    })
    .nullable()
    .default(null),
})

// Pauses in a voice line: "[pause]" or "[pause 0.8s]", up to MAX_PAUSE
// seconds each and MAX_PAUSES per line (more makes ElevenLabs unstable).
export const DEFAULT_PAUSE = 0.5
export const MAX_PAUSE = 3
export const MAX_PAUSES = 3
const PAUSE_MARKER = /\[pause(?:\s+(\d+(?:\.\d+)?)\s*s?)?\s*\]/gi

export const pauseMarker = (length: number) => `[pause ${length}s]`

// The pause lengths in a line, in order.
export function voiceLinePauses(text: string) {
  return [...text.matchAll(PAUSE_MARKER)].map((m) =>
    // The length group is missing when no length was written.
    m[1] ? Number(m[1]) : DEFAULT_PAUSE,
  )
}

// Why a line can't be generated as written, if it can't.
export function voiceLineProblem(text: string): string | undefined {
  const pauses = voiceLinePauses(text)
  if (pauses.length > MAX_PAUSES) {
    return `Use at most ${MAX_PAUSES} pauses in a line.`
  }
  if (pauses.some((p) => p > MAX_PAUSE)) {
    return `Pauses can be up to ${MAX_PAUSE}s.`
  }
  return undefined
}

// The line as sent to the TTS model, with pause markers in its syntax:
// SSML break tags, or (for models without them, like Eleven v3) the
// nearest bracketed pause tag.
export function speechText(text: string, pauses: 'break-tags' | 'audio-tags') {
  return text.trim().replace(PAUSE_MARKER, (_, s: string | undefined) => {
    const length = Math.min(s ? Number(s) : DEFAULT_PAUSE, MAX_PAUSE)
    if (pauses === 'break-tags') return `<break time="${length}s" />`
    return length < 0.5
      ? '[short pause]'
      : length < 1.5
        ? '[pause]'
        : '[long pause]'
  })
}

const sceneBase = {
  id,
  transitionIn: transitionSchema.default('cut'),
  voiceLine: voiceLineSchema.nullable().default(null),
}

const cardDuration = z.number().positive().max(30)

export const sceneSchema = z.discriminatedUnion('type', [
  z.object({
    ...sceneBase,
    type: z.literal('publisher-logo'),
    assetId: id.nullable(),
    duration: cardDuration,
  }),
  // Uses the project's box art, title, prices and packshot colour.
  z.object({
    ...sceneBase,
    type: z.literal('packshot'),
    duration: cardDuration,
    // The game title above the prices (always shown when there are no
    // prices), and a rule under the box art running off the right edge.
    // Off for older docs, on for new scenes.
    showTitle: z.boolean().default(false),
    rule: z.boolean().default(false),
  }),
  z.object({
    ...sceneBase,
    type: z.literal('title-screen'),
    assetId: id.nullable(),
    duration: cardDuration,
  }),
  z.object({
    ...sceneBase,
    type: z.literal('screenshot'),
    assetId: id.nullable(),
    duration: cardDuration,
    captions: z.array(captionSchema).default([]),
  }),
  z
    .object({
      ...sceneBase,
      type: z.literal('gameplay'),
      assetId: id.nullable(),
      // In/out points within the source clip; the scene lasts trimOut - trimIn.
      trimIn: seconds,
      trimOut: seconds,
      keepClipAudio: z.boolean().default(false),
      // Lower the music while this scene's clip audio plays, to `duckLevel`
      // (a fraction of the music volume) or, when null, the project's level.
      duckMusic: z.boolean().default(true),
      duckLevel: z.number().min(0).max(1).nullable().default(null),
      captions: z.array(captionSchema).default([]),
    })
    .refine((s) => s.trimOut > s.trimIn, {
      message: 'Out point must be after the in point',
      path: ['trimOut'],
    }),
])

export const DEFAULT_DUCKING = { level: 0.3, ramp: 0.25 }

export const musicSchema = z.object({
  source: z.discriminatedUnion('type', [
    z.object({ type: z.literal('none') }),
    z.object({ type: z.literal('upload'), assetId: id }),
    z.object({ type: z.literal('clip'), assetId: id }),
  ]),
  // Where in the source audio playback begins.
  sourceOffset: seconds.default(0),
  // Where in the video the music cuts in.
  startAt: z
    .discriminatedUnion('type', [
      z.object({ type: z.literal('first-gameplay') }),
      z.object({ type: z.literal('scene'), sceneId: id }),
    ])
    .default({ type: 'first-gameplay' }),
  volume: z.number().min(0).max(1).default(1),
  // How the music drops under clip audio: `level` is the fraction of the
  // music volume kept, `ramp` the seconds to fade down and back up.
  ducking: z
    .object({
      level: z.number().min(0).max(1).default(DEFAULT_DUCKING.level),
      ramp: z.number().min(0).max(2).default(DEFAULT_DUCKING.ramp),
    })
    .default(DEFAULT_DUCKING),
})

export const narrationSchema = z.object({
  // Null until a voice is chosen.
  voiceId: voiceIdSchema.nullable().default(null),
  volume: z.number().min(0).max(1).default(1),
  // Lower the music (to the project's ducking level) while a line plays.
  duckMusic: z.boolean().default(true),
})

export const DEFAULT_NARRATION = { voiceId: null, volume: 1, duckMusic: true }

export const splashSchema = z.enum(['none', '1985', '1989'])

// The video's shape: the originals' 4:3, widescreen or vertical.
export const aspectRatioSchema = z.enum(['4:3', '16:9', '9:16'])

// What fills the stage around the game screen: black, like the originals,
// or a blurred copy of the game.
export const backdropSchema = z.enum(['black', 'blur'])

// Filter effects over the whole video, each an amount from 0 (off) to 1.
// Tape effects come from the VHS recording; screen effects from the CRT.
const amount = z.number().min(0).max(1).default(0)
export const effectsSchema = z.object({
  softness: amount,
  colourBleed: amount,
  grain: amount,
  tracking: amount,
  scanlines: amount,
  curvature: amount,
  vignette: amount,
})

export const NO_EFFECTS = {
  softness: 0,
  colourBleed: 0,
  grain: 0,
  tracking: 0,
  scanlines: 0,
  curvature: 0,
  vignette: 0,
}

// Seconds a splash can be held for beyond its own length.
export const MAX_SPLASH_HOLD = 3

export const projectDocSchema = z.object({
  version: z.literal(PROJECT_DOC_VERSION),
  aspectRatio: aspectRatioSchema.default('4:3'),
  backdrop: backdropSchema.default('black'),
  effects: effectsSchema.default(NO_EFFECTS),
  title: z.string().max(100),
  publisher: z.string().max(100),
  prices: z.array(pricePlatformSchema).max(8),
  boxArtAssetId: id.nullable(),
  packshotColour: hexColour,
  splash: splashSchema,
  // An uploaded image shown instead of the splash's built-in lettering.
  splashLogoAssetId: id.nullable().default(null),
  // The splash sound: the built-in jingle (1989 only; the 1985 splash is
  // silent, like the original), none, or an uploaded audio file.
  splashJingle: z
    .discriminatedUnion('type', [
      z.object({ type: z.literal('built-in') }),
      z.object({ type: z.literal('none') }),
      z.object({ type: z.literal('upload'), assetId: id }),
    ])
    .default({ type: 'built-in' }),
  // Extra seconds the splash holds on its last pose before the first scene.
  splashHold: z.number().min(0).max(MAX_SPLASH_HOLD).default(0),
  music: musicSchema,
  narration: narrationSchema.default(DEFAULT_NARRATION),
  scenes: z.array(sceneSchema).max(50),
})

export type PricePlatform = z.infer<typeof pricePlatformSchema>
export type Caption = z.infer<typeof captionSchema>
export type Scene = z.infer<typeof sceneSchema>
export type SceneType = Scene['type']
export type Transition = z.infer<typeof transitionSchema>
export type Music = z.infer<typeof musicSchema>
export type Splash = z.infer<typeof splashSchema>
export type AspectRatio = z.infer<typeof aspectRatioSchema>
export type Backdrop = z.infer<typeof backdropSchema>
export type Effects = z.infer<typeof effectsSchema>
export type Effect = keyof Effects
export type VoiceLine = z.infer<typeof voiceLineSchema>
export type VoiceSettings = z.infer<typeof voiceSettingsSchema>
export type Narration = z.infer<typeof narrationSchema>
export type ProjectDoc = z.infer<typeof projectDocSchema>

export const DEFAULT_PACKSHOT_COLOUR = '#1b23aa'
export const DEFAULT_CARD_DURATION = 4

export function createProjectDoc(title = 'Untitled game'): ProjectDoc {
  return {
    version: PROJECT_DOC_VERSION,
    aspectRatio: '4:3',
    backdrop: 'black',
    effects: NO_EFFECTS,
    title,
    publisher: '',
    prices: [],
    boxArtAssetId: null,
    packshotColour: DEFAULT_PACKSHOT_COLOUR,
    splash: 'none',
    splashLogoAssetId: null,
    splashJingle: { type: 'built-in' },
    splashHold: 0,
    music: {
      source: { type: 'none' },
      sourceOffset: 0,
      startAt: { type: 'first-gameplay' },
      volume: 1,
      ducking: DEFAULT_DUCKING,
    },
    narration: DEFAULT_NARRATION,
    scenes: [
      {
        id: crypto.randomUUID(),
        type: 'packshot',
        transitionIn: 'cut',
        voiceLine: null,
        duration: DEFAULT_CARD_DURATION,
        showTitle: true,
        rule: true,
      },
    ],
  }
}

// Editing helpers used by the editor and the server. They never mutate.

export const DEFAULT_LOGO_DURATION = 2.5
// A new gameplay scene uses the whole clip, up to this long.
export const DEFAULT_GAMEPLAY_LENGTH = 10

export function newScene(
  type: SceneType,
  asset?: { id: string; duration?: number },
): Scene {
  const base = {
    id: crypto.randomUUID(),
    transitionIn: 'cut' as const,
    voiceLine: null,
  }
  const assetId = asset?.id ?? null
  switch (type) {
    case 'packshot':
      return {
        ...base,
        type,
        duration: DEFAULT_CARD_DURATION,
        showTitle: true,
        rule: true,
      }
    case 'publisher-logo':
      return { ...base, type, assetId, duration: DEFAULT_LOGO_DURATION }
    case 'title-screen':
      return { ...base, type, assetId, duration: DEFAULT_CARD_DURATION }
    case 'screenshot':
      return {
        ...base,
        type,
        assetId,
        duration: DEFAULT_CARD_DURATION,
        captions: [],
      }
    case 'gameplay':
      return {
        ...base,
        type,
        assetId,
        trimIn: 0,
        trimOut: Math.min(
          asset?.duration ?? DEFAULT_GAMEPLAY_LENGTH,
          DEFAULT_GAMEPLAY_LENGTH,
        ),
        keepClipAudio: false,
        duckMusic: true,
        duckLevel: null,
        captions: [],
      }
  }
}

export function moveScene(doc: ProjectDoc, from: number, to: number) {
  const scenes = [...doc.scenes]
  const [scene] = scenes.splice(from, 1)
  scenes.splice(to, 0, scene)
  return { ...doc, scenes }
}

export function removeScene(doc: ProjectDoc, sceneId: string): ProjectDoc {
  const { startAt } = doc.music
  return {
    ...doc,
    scenes: doc.scenes.filter((s) => s.id !== sceneId),
    music:
      startAt.type === 'scene' && startAt.sceneId === sceneId
        ? { ...doc.music, startAt: { type: 'first-gameplay' } }
        : doc.music,
  }
}

export function sceneLength(scene: Scene) {
  return scene.type === 'gameplay'
    ? scene.trimOut - scene.trimIn
    : scene.duration
}

// Every asset id the doc points at.
export function assetIdsInDoc(doc: ProjectDoc) {
  const ids = new Set<string>()
  if (doc.boxArtAssetId) ids.add(doc.boxArtAssetId)
  if (doc.splashLogoAssetId) ids.add(doc.splashLogoAssetId)
  if (doc.splashJingle.type === 'upload') ids.add(doc.splashJingle.assetId)
  if (doc.music.source.type !== 'none') ids.add(doc.music.source.assetId)
  for (const scene of doc.scenes) {
    if ('assetId' in scene && scene.assetId) ids.add(scene.assetId)
  }
  return ids
}

// Drops references to a deleted asset. Scenes stay, showing a placeholder.
export function removeAssetReferences(
  doc: ProjectDoc,
  assetId: string,
): ProjectDoc {
  const source = doc.music.source
  return {
    ...doc,
    boxArtAssetId: doc.boxArtAssetId === assetId ? null : doc.boxArtAssetId,
    splashLogoAssetId:
      doc.splashLogoAssetId === assetId ? null : doc.splashLogoAssetId,
    splashJingle:
      doc.splashJingle.type === 'upload' && doc.splashJingle.assetId === assetId
        ? { type: 'built-in' }
        : doc.splashJingle,
    music:
      source.type !== 'none' && source.assetId === assetId
        ? { ...doc.music, source: { type: 'none' } }
        : doc.music,
    scenes: doc.scenes.map((scene) =>
      'assetId' in scene && scene.assetId === assetId
        ? { ...scene, assetId: null }
        : scene,
    ),
  }
}

export type VoiceLineStatus = 'none' | 'needs-generating' | 'ready'

const sameSettings = (a: VoiceSettings | null, b: VoiceSettings | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    (Object.keys(a) as Array<keyof VoiceSettings>).every((k) => a[k] === b[k]))

// The voice a line is read in: its own, or the project's.
export const lineVoiceId = (doc: ProjectDoc, line: VoiceLine) =>
  line.voiceId ?? doc.narration.voiceId

// Whether a scene's voice line has audio matching its text, voice and
// settings. Empty lines count as none.
export function voiceLineStatus(
  doc: ProjectDoc,
  scene: Scene,
): VoiceLineStatus {
  const line = scene.voiceLine
  if (!line || line.text.trim() === '') return 'none'
  const { clip } = line
  return clip &&
    clip.text === line.text.trim() &&
    clip.voiceId === lineVoiceId(doc, line) &&
    sameSettings(clip.settings, line.settings)
    ? 'ready'
    : 'needs-generating'
}

// Scenes whose voice lines need generating.
export function scenesNeedingVoice(doc: ProjectDoc) {
  return doc.scenes.filter(
    (s) => voiceLineStatus(doc, s) === 'needs-generating',
  )
}

// Every generated voice clip the doc points at.
export function voiceClipIdsInDoc(doc: ProjectDoc) {
  const ids = new Set<string>()
  for (const scene of doc.scenes) {
    if (scene.voiceLine?.clip) ids.add(scene.voiceLine.clip.id)
  }
  return ids
}
