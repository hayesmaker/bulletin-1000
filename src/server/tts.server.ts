import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { and, eq, gt, sql } from 'drizzle-orm'
import {
  MAX_VOICE_LINE_LENGTH,
  speechText,
  voiceLinePauses,
  voiceLineProblem,
} from '#/lib/project'
import type { VoiceSettings } from '#/lib/project'
import { dataDir } from '#/server/config.server'
import type { Db } from '#/server/db/client.server'
import { voiceClips } from '#/server/db/schema'
import { probe } from '#/server/ffmpeg.server'

// Text to speech for narration. The ElevenLabs API key is read here, on the
// server, and never sent to the browser.
//
// Environment:
//   ELEVENLABS_API_KEY    enables ElevenLabs
//   ELEVENLABS_MODEL      model id (default eleven_multilingual_v2)
//   ELEVENLABS_VOICES     comma-separated voice ids to offer (default: all
//                         the account's voices)
//   TTS_DAILY_CHARACTERS  characters generated per 24h (default 20000);
//                         cached lines are free
//   TTS_FAKE=1            without a key, use a stand-in that makes
//                         speech-length tones (tests and development)
//
// Generated clips are cached by a hash of everything that shaped them, in
// the voice_clips table and <DATA_DIR>/voice/<id>.mp3.

export interface Voice {
  voiceId: string
  name: string
  description?: string
  accent?: string
  gender?: string
  previewUrl?: string
}

export interface TtsProvider {
  name: 'elevenlabs' | 'stand-in'
  model: string
  // MP3 audio of the line. `text` may hold pause markers ("[pause 0.8s]");
  // settings null means the voice's own.
  synthesize: (
    text: string,
    voiceId: string,
    settings: VoiceSettings | null,
  ) => Promise<Buffer>
  listVoices: () => Promise<Voice[]>
}

// A user-facing problem: bad key, quota, limits, unknown voice.
export class TtsError extends Error {}

const ELEVENLABS_API = 'https://api.elevenlabs.io'
const DEFAULT_MODEL = 'eleven_multilingual_v2'
const DEFAULT_DAILY_CHARACTERS = 20_000
const REQUEST_TIMEOUT_MS = 60_000
const VOICES_TTL_MS = 60 * 60 * 1000
// Fixed, so regenerating the same line gives (nearly) the same read.
const SEED = 1000

export function ttsProvider(): TtsProvider | null {
  const key = process.env.ELEVENLABS_API_KEY?.trim()
  if (key) return elevenLabs(key, process.env.ELEVENLABS_MODEL || DEFAULT_MODEL)
  if (process.env.TTS_FAKE === '1') return standIn
  return null
}

export function dailyCharacterLimit() {
  const set = Number(process.env.TTS_DAILY_CHARACTERS)
  return Number.isInteger(set) && set >= 0 ? set : DEFAULT_DAILY_CHARACTERS
}

// ElevenLabs

interface ElevenLabsVoice {
  voice_id: string
  name?: string
  description?: string | null
  preview_url?: string | null
  labels?: Record<string, string | undefined> | null
}

// Turns an ElevenLabs error response into a message for the editor.
export async function elevenLabsError(response: Response) {
  let status: string | undefined
  let message: string | undefined
  try {
    const body = (await response.json()) as {
      detail?: { status?: string; message?: string } | Array<{ msg?: string }>
    }
    if (Array.isArray(body.detail)) message = body.detail[0]?.msg
    else {
      status = body.detail?.status
      message = body.detail?.message
    }
  } catch {
    // Not JSON; fall back to the HTTP status.
  }
  if (status === 'quota_exceeded') {
    return new TtsError(
      'The ElevenLabs character quota is used up. Check your plan or the key’s character limit.',
    )
  }
  if (status === 'voice_not_found' || response.status === 404) {
    return new TtsError(
      'That voice isn’t available on this ElevenLabs account. Choose another.',
    )
  }
  if (status === 'missing_permissions') {
    return new TtsError(
      `The ElevenLabs key is missing a permission: ${message ?? 'check its settings'}.`,
    )
  }
  if (response.status === 401) {
    return new TtsError(
      'ElevenLabs rejected the API key. Check ELEVENLABS_API_KEY.',
    )
  }
  if (response.status === 429) {
    return new TtsError(
      'ElevenLabs is busy or rate-limiting this key. Try again in a moment.',
    )
  }
  return new TtsError(
    `ElevenLabs error (${response.status})${message ? `: ${message}` : ''}`,
  )
}

// Eleven v3 and later have no SSML break tags; they take bracketed pause
// tags instead.
export const pauseStyle = (model: string) =>
  /^eleven_v\d/.test(model) ? 'audio-tags' : 'break-tags'

function elevenLabs(key: string, model: string): TtsProvider {
  const request = async (url: string, init: RequestInit = {}) => {
    let response: Response
    try {
      response = await fetch(`${ELEVENLABS_API}${url}`, {
        ...init,
        headers: { 'xi-api-key': key, ...init.headers },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch {
      throw new TtsError('Couldn’t reach ElevenLabs. Try again in a moment.')
    }
    if (!response.ok) throw await elevenLabsError(response)
    return response
  }

  let voices: { list: Voice[]; at: number } | undefined

  return {
    name: 'elevenlabs',
    model,
    async synthesize(text, voiceId, settings) {
      const response = await request(
        `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
          body: JSON.stringify({
            text: speechText(text, pauseStyle(model)),
            model_id: model,
            seed: SEED,
            ...(settings && {
              voice_settings: {
                stability: settings.stability,
                similarity_boost: settings.similarity,
                style: settings.style,
                speed: settings.speed,
                use_speaker_boost: true,
              },
            }),
          }),
        },
      )
      return Buffer.from(await response.arrayBuffer())
    },
    async listVoices() {
      if (voices && Date.now() - voices.at < VOICES_TTL_MS) return voices.list
      const response = await request('/v1/voices')
      const body = (await response.json()) as { voices?: ElevenLabsVoice[] }
      const allowed = (process.env.ELEVENLABS_VOICES ?? '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
      const list = (body.voices ?? [])
        .filter((v) => allowed.length === 0 || allowed.includes(v.voice_id))
        .map((v): Voice => ({
          voiceId: v.voice_id,
          name: v.name ?? v.voice_id,
          description: v.labels?.description ?? v.description ?? undefined,
          accent: v.labels?.accent,
          gender: v.labels?.gender,
          previewUrl: v.preview_url ?? undefined,
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
      voices = { list, at: Date.now() }
      return list
    },
  }
}

// Stand-in: a tone that pulses like syllables, as long as the line would
// take to read. Lets the whole narration flow run without a key.

const STAND_IN_SECONDS_PER_CHARACTER = 0.065
const standInVoices: Array<Voice & { pitch: number }> = [
  { voiceId: 'stand-in-low', name: 'Stand-in (low)', pitch: 140 },
  { voiceId: 'stand-in-high', name: 'Stand-in (high)', pitch: 220 },
]

export const standIn: TtsProvider = {
  name: 'stand-in',
  model: 'tones-v1',
  synthesize(text, voiceId, settings) {
    const voice = standInVoices.find((v) => v.voiceId === voiceId)
    if (!voice) {
      return Promise.reject(new TtsError('Unknown stand-in voice.'))
    }
    // Spoken characters at the line's speed, plus its pauses.
    const spoken = speechText(text, 'break-tags').replace(/<break[^>]*>/g, '')
    const pauses = voiceLinePauses(text).reduce((sum, p) => sum + p, 0)
    const seconds = Math.max(
      0.6,
      (spoken.length * STAND_IN_SECONDS_PER_CHARACTER) /
        (settings?.speed ?? 1) +
        pauses,
    )
    const tone = `0.4*sin(2*PI*${voice.pitch}*t)*(0.55+0.45*sin(2*PI*4*t))`
    return new Promise<Buffer>((resolve, reject) => {
      const child = spawn(
        'ffmpeg',
        [
          '-v', 'error',
          '-f', 'lavfi', '-i', `aevalsrc=${tone}:s=44100:d=${seconds.toFixed(3)}`,
          '-c:a', 'libmp3lame', '-b:a', '128k', '-f', 'mp3', 'pipe:1',
        ], // prettier-ignore
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
      const chunks: Buffer[] = []
      child.stdout.on('data', (c: Buffer) => chunks.push(c))
      child.on('error', reject)
      child.on('close', (code) =>
        code === 0
          ? resolve(Buffer.concat(chunks))
          : reject(new Error(`ffmpeg exited with code ${code}`)),
      )
    })
  },
  listVoices: () =>
    Promise.resolve(standInVoices.map(({ pitch: _, ...v }) => v)),
}

// Cache and generation

export function voiceClipId(
  provider: Pick<TtsProvider, 'name' | 'model'>,
  voiceId: string,
  text: string,
  settings: VoiceSettings | null = null,
) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        provider: provider.name,
        model: provider.model,
        voiceId,
        seed: SEED,
        text,
        // Only when set, so clips made before line settings keep their ids.
        ...(settings && { settings }),
      }),
    )
    .digest('hex')
}

export function voiceClipPath(id: string) {
  return path.join(dataDir(), 'voice', `${id}.mp3`)
}

export function findVoiceClip(db: Db, id: string) {
  return db.select().from(voiceClips).where(eq(voiceClips.id, id)).get()
}

// Characters a provider generated in the last 24 hours. Counted per
// provider, so stand-in runs don't use up the ElevenLabs allowance.
export function charactersUsedToday(
  db: Db,
  provider: TtsProvider['name'],
  now = Date.now(),
) {
  const row = db
    .select({ total: sql<number>`coalesce(sum(${voiceClips.characters}), 0)` })
    .from(voiceClips)
    .where(
      and(
        eq(voiceClips.provider, provider),
        gt(voiceClips.createdAt, new Date(now - 24 * 60 * 60 * 1000)),
      ),
    )
    .get()
  return row?.total ?? 0
}

const fileExists = (file: string) =>
  fsp.stat(file).then(
    () => true,
    () => false,
  )

// One generation at a time, so concurrent requests can't overshoot the
// daily limit or hammer the API.
let queue: Promise<unknown> = Promise.resolve()

export interface GeneratedClip {
  id: string
  duration: number
  text: string
  voiceId: string
  settings: VoiceSettings | null
}

// The audio for a line, generated (and cached) if it isn't already.
export async function generateVoiceClip(
  db: Db,
  rawText: string,
  voiceId: string,
  settings: VoiceSettings | null = null,
  provider = ttsProvider(),
): Promise<GeneratedClip> {
  if (!provider) {
    throw new TtsError(
      'Narration isn’t set up: add ELEVENLABS_API_KEY to the server’s .env.',
    )
  }
  const text = rawText.trim()
  if (!text) throw new TtsError('The line is empty.')
  if (text.length > MAX_VOICE_LINE_LENGTH) {
    throw new TtsError(
      `Lines can be up to ${MAX_VOICE_LINE_LENGTH} characters.`,
    )
  }
  const problem = voiceLineProblem(text)
  if (problem) throw new TtsError(problem)
  const id = voiceClipId(provider, voiceId, text, settings)
  const clip = (duration: number) => ({
    id,
    duration,
    text,
    voiceId,
    settings,
  })
  const cached = async () => {
    const row = findVoiceClip(db, id)
    if (row && (await fileExists(path.join(dataDir(), row.path)))) {
      return clip(row.duration)
    }
    return undefined
  }

  const hit = await cached()
  if (hit) return hit

  const run = queue.then(async () => {
    const again = await cached()
    if (again) return again
    const limit = dailyCharacterLimit()
    const used = charactersUsedToday(db, provider.name)
    if (used + text.length > limit) {
      throw new TtsError(
        `The daily narration limit is used up (${used.toLocaleString()} of ${limit.toLocaleString()} characters in the last 24 hours).`,
      )
    }
    const audio = await provider.synthesize(text, voiceId, settings)
    const file = voiceClipPath(id)
    await fsp.mkdir(path.dirname(file), { recursive: true })
    await fsp.writeFile(`${file}.part`, audio)
    const duration = (await probe(`${file}.part`)).duration
    if (!duration) {
      await fsp.rm(`${file}.part`, { force: true })
      throw new Error('The generated audio has no duration')
    }
    await fsp.rename(`${file}.part`, file)
    db.insert(voiceClips)
      .values({
        id,
        provider: provider.name,
        voiceId,
        path: path.relative(dataDir(), file),
        duration,
        characters: text.length,
      })
      .onConflictDoUpdate({
        target: voiceClips.id,
        set: { duration, path: path.relative(dataDir(), file) },
      })
      .run()
    return clip(duration)
  })
  queue = run.catch(() => undefined)
  return run
}
