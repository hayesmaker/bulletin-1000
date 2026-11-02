import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  MAX_VOICE_LINE_LENGTH,
  voiceIdSchema,
  voiceSettingsSchema,
} from '#/lib/project'
import { getDb } from '#/server/db/client.server'
import {
  TtsError,
  charactersUsedToday,
  dailyCharacterLimit,
  generateVoiceClip,
  ttsProvider,
} from '#/server/tts.server'

// Narration for the editor. No auth yet (see projects.functions.ts); the
// daily character limit is global until accounts exist.

// Server errors reach the browser as their message; anything unexpected
// gets a generic one rather than internals.
async function friendly<T>(work: () => Promise<T>) {
  try {
    return await work()
  } catch (error) {
    if (error instanceof TtsError) throw new Error(error.message)
    console.error(error)
    throw new Error('Narration failed. Check the server log.')
  }
}

export const getTtsStatus = createServerFn({ method: 'GET' }).handler(
  async () => {
    const provider = ttsProvider()
    return {
      provider: provider?.name ?? null,
      dailyLimit: dailyCharacterLimit(),
      usedToday: provider ? charactersUsedToday(getDb(), provider.name) : 0,
    }
  },
)

export const getVoices = createServerFn({ method: 'GET' }).handler(async () => {
  const provider = ttsProvider()
  if (!provider) return []
  return friendly(() => provider.listVoices())
})

// Generates (or fetches from the cache) the audio for a line. The editor
// stores the result in the scene's voiceLine.clip.
export const generateVoiceLine = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      text: z.string().max(MAX_VOICE_LINE_LENGTH + 100),
      voiceId: voiceIdSchema,
      settings: voiceSettingsSchema.nullable().default(null),
    }),
  )
  .handler(async ({ data }) =>
    friendly(() =>
      generateVoiceClip(getDb(), data.text, data.voiceId, data.settings),
    ),
  )
