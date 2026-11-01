import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDb } from '#/server/db/client.server'
import type { Db } from '#/server/db/client.server'
import { voiceClips } from '#/server/db/schema'
import {
  TtsError,
  charactersUsedToday,
  generateVoiceClip,
  standIn,
  ttsProvider,
  voiceClipId,
} from './tts.server'
import type { TtsProvider } from './tts.server'

let tmp: string
let db: Db

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'b1k-tts-'))
  process.env.DATA_DIR = tmp
  db = openDb(':memory:')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  delete process.env.DATA_DIR
  fs.rmSync(tmp, { recursive: true, force: true })
})

// The stand-in, counting its calls.
function countingStandIn() {
  const provider = { ...standIn, calls: 0 }
  provider.synthesize = (text, voice) => {
    provider.calls++
    return standIn.synthesize(text, voice)
  }
  return provider
}

describe('voiceClipId', () => {
  it('changes with the text, voice, provider and model', () => {
    const base = voiceClipId(standIn, 'a', 'Hello')
    expect(base).toMatch(/^[0-9a-f]{64}$/)
    expect(voiceClipId(standIn, 'a', 'Hello')).toBe(base)
    expect(voiceClipId(standIn, 'b', 'Hello')).not.toBe(base)
    expect(voiceClipId(standIn, 'a', 'Hello!')).not.toBe(base)
    expect(voiceClipId({ ...standIn, model: 'x' }, 'a', 'Hello')).not.toBe(base)
  })
})

describe('generateVoiceClip', () => {
  it('generates once, then serves the cache', async () => {
    const provider = countingStandIn()
    const text = 'Gyroscope, out now for the Spectrum.'
    const clip = await generateVoiceClip(
      db,
      `  ${text} `,
      'stand-in-low',
      provider,
    )
    expect(clip.text).toBe(text)
    // About 65ms a character.
    expect(clip.duration).toBeGreaterThan(text.length * 0.06)
    expect(clip.duration).toBeLessThan(text.length * 0.07 + 0.2)
    expect(fs.existsSync(path.join(tmp, 'voice', `${clip.id}.mp3`))).toBe(true)

    expect(await generateVoiceClip(db, text, 'stand-in-low', provider)).toEqual(
      clip,
    )
    expect(provider.calls).toBe(1)
    expect(charactersUsedToday(db, 'stand-in')).toBe(text.length)
    expect(charactersUsedToday(db, 'elevenlabs')).toBe(0)
  })

  it('runs one generation at a time', async () => {
    const provider = countingStandIn()
    const [a, b] = await Promise.all([
      generateVoiceClip(db, 'Same line', 'stand-in-low', provider),
      generateVoiceClip(db, 'Same line', 'stand-in-low', provider),
    ])
    expect(a).toEqual(b)
    expect(provider.calls).toBe(1)
  })

  it('enforces the daily limit, but not for cached lines', async () => {
    vi.stubEnv('TTS_DAILY_CHARACTERS', '20')
    const provider = countingStandIn()
    await generateVoiceClip(db, 'Twelve chars', 'stand-in-low', provider)
    await expect(
      generateVoiceClip(db, 'Twelve again', 'stand-in-low', provider),
    ).rejects.toThrow(/daily narration limit/)
    await expect(
      generateVoiceClip(db, 'Twelve chars', 'stand-in-low', provider),
    ).resolves.toBeTruthy()
  })

  it('only counts the last 24 hours', () => {
    const now = Date.now()
    db.insert(voiceClips)
      .values([
        {
          id: 'a',
          provider: 'elevenlabs',
          voiceId: 'v',
          path: 'p',
          duration: 1,
          characters: 100,
          createdAt: new Date(now - 25 * 3600_000),
        },
        {
          id: 'b',
          provider: 'elevenlabs',
          voiceId: 'v',
          path: 'p',
          duration: 1,
          characters: 7,
          createdAt: new Date(now - 3600_000),
        },
      ]) // prettier-ignore
      .run()
    expect(charactersUsedToday(db, 'elevenlabs', now)).toBe(7)
    expect(charactersUsedToday(db, 'stand-in', now)).toBe(0)
  })

  it('rejects empty and over-long lines, and works only when set up', async () => {
    await expect(
      generateVoiceClip(db, '   ', 'stand-in-low', standIn),
    ).rejects.toThrow(TtsError)
    await expect(
      generateVoiceClip(db, 'x'.repeat(501), 'stand-in-low', standIn),
    ).rejects.toThrow(/500/)
    await expect(generateVoiceClip(db, 'Hi', 'v', null)).rejects.toThrow(
      /ELEVENLABS_API_KEY/,
    )
  })
})

describe('ttsProvider', () => {
  it('picks ElevenLabs with a key, the stand-in with TTS_FAKE, else none', () => {
    vi.stubEnv('ELEVENLABS_API_KEY', '')
    vi.stubEnv('TTS_FAKE', '')
    expect(ttsProvider()).toBeNull()
    vi.stubEnv('TTS_FAKE', '1')
    expect(ttsProvider()?.name).toBe('stand-in')
    vi.stubEnv('ELEVENLABS_API_KEY', 'sk_test')
    expect(ttsProvider()?.name).toBe('elevenlabs')
  })
})

describe('ElevenLabs', () => {
  function provider(): TtsProvider {
    vi.stubEnv('ELEVENLABS_API_KEY', 'sk_test')
    vi.stubEnv('ELEVENLABS_MODEL', '')
    return ttsProvider()!
  }

  it('sends the line with the key in a header', async () => {
    const fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))
    vi.stubGlobal('fetch', fetch)
    const audio = await provider().synthesize('Hello', 'voice123')
    expect([...audio]).toEqual([1, 2, 3])
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(
      'https://api.elevenlabs.io/v1/text-to-speech/voice123?output_format=mp3_44100_128',
    )
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe(
      'sk_test',
    )
    expect(JSON.parse(init.body as string)).toEqual({
      text: 'Hello',
      model_id: 'eleven_multilingual_v2',
      seed: 1000,
    })
  })

  it.each([
    [401, { detail: { status: 'quota_exceeded', message: 'x' } }, /quota/],
    [
      401,
      { detail: { status: 'invalid_api_key', message: 'x' } },
      /rejected the API key/,
    ],
    [
      401,
      {
        detail: {
          status: 'missing_permissions',
          message: 'needs text_to_speech',
        },
      },
      /text_to_speech/,
    ],
    [
      404,
      { detail: { status: 'voice_not_found', message: 'x' } },
      /voice isn’t available/,
    ],
    [429, { detail: { status: 'too_many_concurrent_requests' } }, /Try again/],
    [422, { detail: [{ msg: 'text too long' }] }, /text too long/],
  ])('explains a %i error', async (status, body, message) => {
    vi.stubGlobal('fetch', async () => Response.json(body, { status }))
    await expect(provider().synthesize('Hi', 'v')).rejects.toThrow(message)
  })

  it('lists voices, keeping only the curated ones', async () => {
    vi.stubEnv('ELEVENLABS_VOICES', 'b, a')
    vi.stubGlobal(
      'fetch',
      async () =>
      Response.json({
        voices: [
          { voice_id: 'c', name: 'Cee' },
          { voice_id: 'b', name: 'Bea', labels: { accent: 'british', gender: 'female' }, preview_url: 'https://x/b.mp3' },
          { voice_id: 'a', name: 'Al', description: 'Warm' },
        ],
      }), // prettier-ignore
    )
    expect(await provider().listVoices()).toEqual([
      { voiceId: 'a', name: 'Al', description: 'Warm', accent: undefined, gender: undefined, previewUrl: undefined },
      { voiceId: 'b', name: 'Bea', description: undefined, accent: 'british', gender: 'female', previewUrl: 'https://x/b.mp3' },
    ]) // prettier-ignore
  })
})
