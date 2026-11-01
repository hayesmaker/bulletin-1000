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

const sceneBase = {
  id,
  transitionIn: transitionSchema.default('cut'),
}

const cardDuration = z.number().positive().max(30)

export const sceneSchema = z.discriminatedUnion('type', [
  z.object({
    ...sceneBase,
    type: z.literal('publisher-logo'),
    assetId: id.nullable(),
    duration: cardDuration,
  }),
  // Uses the project's box art, prices and packshot colour.
  z.object({
    ...sceneBase,
    type: z.literal('packshot'),
    duration: cardDuration,
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
      // Lower the music while this scene's clip audio plays.
      duckMusic: z.boolean().default(true),
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

export const splashSchema = z.enum(['none', '1985', '1989'])

export const projectDocSchema = z.object({
  version: z.literal(PROJECT_DOC_VERSION),
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
  music: musicSchema,
  scenes: z.array(sceneSchema).max(50),
})

export type PricePlatform = z.infer<typeof pricePlatformSchema>
export type Caption = z.infer<typeof captionSchema>
export type Scene = z.infer<typeof sceneSchema>
export type SceneType = Scene['type']
export type Transition = z.infer<typeof transitionSchema>
export type Music = z.infer<typeof musicSchema>
export type Splash = z.infer<typeof splashSchema>
export type ProjectDoc = z.infer<typeof projectDocSchema>

export const DEFAULT_PACKSHOT_COLOUR = '#1b23aa'
export const DEFAULT_CARD_DURATION = 4

export function createProjectDoc(title = 'Untitled game'): ProjectDoc {
  return {
    version: PROJECT_DOC_VERSION,
    title,
    publisher: '',
    prices: [],
    boxArtAssetId: null,
    packshotColour: DEFAULT_PACKSHOT_COLOUR,
    splash: 'none',
    splashLogoAssetId: null,
    splashJingle: { type: 'built-in' },
    music: {
      source: { type: 'none' },
      sourceOffset: 0,
      startAt: { type: 'first-gameplay' },
      volume: 1,
      ducking: DEFAULT_DUCKING,
    },
    scenes: [
      {
        id: crypto.randomUUID(),
        type: 'packshot',
        transitionIn: 'cut',
        duration: DEFAULT_CARD_DURATION,
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
  const base = { id: crypto.randomUUID(), transitionIn: 'cut' as const }
  const assetId = asset?.id ?? null
  switch (type) {
    case 'packshot':
      return { ...base, type, duration: DEFAULT_CARD_DURATION }
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
