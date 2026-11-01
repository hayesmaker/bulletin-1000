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
      captions: z.array(captionSchema).default([]),
    })
    .refine((s) => s.trimOut > s.trimIn, {
      message: 'Out point must be after the in point',
      path: ['trimOut'],
    }),
])

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
  music: musicSchema,
  scenes: z.array(sceneSchema).max(50),
})

export type PricePlatform = z.infer<typeof pricePlatformSchema>
export type Caption = z.infer<typeof captionSchema>
export type Scene = z.infer<typeof sceneSchema>
export type SceneType = Scene['type']
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
    music: {
      source: { type: 'none' },
      sourceOffset: 0,
      startAt: { type: 'first-gameplay' },
      volume: 1,
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
