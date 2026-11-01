import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { musicGain } from '#/composition/schedule'
import type { MusicCue, Schedule } from '#/composition/schedule'
import { BUILT_IN_JINGLE, SAMPLE_RATE, buildAudioMix } from './mix.server'

// Runs the mix through ffmpeg with constant-level inputs and checks the
// output level against the preview's musicGain(). Inputs are stereo, like
// transcoded uploads. Needs ffmpeg on the PATH.

let tmp: string
const ffmpeg = (...args: string[]) =>
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...args], {
    maxBuffer: 64 * 1024 * 1024,
  })

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'b1k-mix-'))
  ffmpeg(
    '-f',
    'lavfi',
    '-i',
    'aevalsrc=0.5|0.5:d=20',
    path.join(tmp, 'music.wav'),
  )
  ffmpeg(
    '-f',
    'lavfi',
    '-i',
    'aevalsrc=0.25|0.25:d=20',
    path.join(tmp, 'clip.wav'),
  )
})

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

const music: MusicCue = {
  assetId: 'tune',
  start: 2,
  end: 12,
  sourceOffset: 1,
  volume: 0.8,
  fadeOut: 1.5,
  ducking: {
    ramp: 0.5,
    windows: [
      { start: 5, end: 8, level: 0.25 },
      { start: 8, end: 9, level: 0.6 },
    ],
  },
}

const schedule: Schedule = {
  items: [],
  duration: 12,
  music,
  clipAudio: [
    {
      sceneId: 's',
      assetId: 'clip',
      start: 5,
      end: 8,
      trimIn: 3,
      duckLevel: 0.25,
    },
  ],
  jingle: null,
  narration: [],
  narrationVolume: 1,
}

describe('buildAudioMix', () => {
  it('mixes music with the preview volume curve and clip audio', () => {
    const files = new Map([
      ['tune', path.join(tmp, 'music.wav')],
      ['clip', path.join(tmp, 'clip.wav')],
    ])
    const mix = buildAudioMix(schedule, files, 0)
    const raw = ffmpeg(
      ...mix.inputArgs,
      '-filter_complex',
      mix.filter,
      '-map',
      mix.output,
      '-f',
      'f32le',
      '-',
    )
    const samples = new Float32Array(
      raw.buffer,
      raw.byteOffset,
      raw.byteLength / 4,
    )
    // Stereo, interleaved: read the left channel.
    const at = (t: number) => samples[Math.round(t * SAMPLE_RATE) * 2]

    expect(samples.length / 2 / SAMPLE_RATE).toBeCloseTo(12, 1)
    for (const t of [1, 3, 4.75, 6, 8.25, 8.5, 9.25, 9.5, 11.25]) {
      const clip = t >= 5 && t < 8 ? 0.25 : 0
      expect(at(t)).toBeCloseTo(0.5 * musicGain(music, t) + clip, 1)
    }
    expect(at(1)).toBe(0)
    expect(at(6)).toBeCloseTo(0.35, 2)
    // The second window's own level: 0.5 × 0.8 × 0.6.
    expect(at(8.75)).toBeCloseTo(0.24, 2)
  })

  it('adds the jingle at its start', () => {
    const mix = buildAudioMix(
      {
        ...schedule,
        music: null,
        clipAudio: [],
        jingle: { assetId: null, start: 0, end: 7 },
      },
      new Map([[BUILT_IN_JINGLE, '/jingle.wav']]),
      1,
    )
    expect(mix.inputArgs.slice(-4)).toEqual(['-t', '7', '-i', '/jingle.wav'])
    expect(mix.filter).toContain('[jingle]amix=inputs=2')
  })

  it('mixes narration at its volume, from each line’s start', () => {
    ffmpeg(
      '-f', 'lavfi', '-i', 'aevalsrc=0.4|0.4:d=2',
      path.join(tmp, 'voice.wav'),
    ) // prettier-ignore
    const mix = buildAudioMix(
      {
        ...schedule,
        music: null,
        clipAudio: [],
        narration: [{ sceneId: 's', clipId: 'line', start: 3, end: 4.5 }],
        narrationVolume: 0.5,
      },
      new Map([['line', path.join(tmp, 'voice.wav')]]),
      0,
    )
    const raw = ffmpeg(
      ...mix.inputArgs,
      '-filter_complex', mix.filter,
      '-map', mix.output, '-f', 'f32le', '-',
    ) // prettier-ignore
    const samples = new Float32Array(
      raw.buffer,
      raw.byteOffset,
      raw.byteLength / 4,
    )
    const at = (t: number) => samples[Math.round(t * SAMPLE_RATE) * 2]
    expect(at(2.9)).toBe(0)
    expect(at(3.5)).toBeCloseTo(0.2, 2)
    expect(at(4.4)).toBeCloseTo(0.2, 2)
    // Cut at the cue's end.
    expect(at(4.7)).toBe(0)
  })

  it('is a silent bed when there is no audio', () => {
    const mix = buildAudioMix(
      { ...schedule, music: null, clipAudio: [] },
      new Map(),
      1,
    )
    expect(mix.filter).toBe(
      '[1:a]amix=inputs=1:duration=first:normalize=0[audio]',
    )
  })
})
