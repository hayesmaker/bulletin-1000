import fs from 'node:fs/promises'
import path from 'node:path'
import { timing } from '#/composition/theme'
import { dataDir } from '#/server/config.server'

// The built-in 1989 splash jingle: an original synth ident in the style of
// the late-80s original (D major, ~150 bpm, plucked arpeggio, bell lead,
// bass, two big drum hits and a ringing final chord), synthesised here so
// no original audio is used. Deterministic: the same samples every time.
// Generated once into <DATA_DIR>/generated/ and served from there.

export const JINGLE_SAMPLE_RATE = 48000
export const JINGLE_DURATION = timing.builtInJingle
// Bump when the sound changes, so cached files are regenerated.
const JINGLE_VERSION = 1

const BEAT = 60 / 150
const EIGHTH = BEAT / 2

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)
// MIDI note numbers.
const D2 = 38
const D3 = 50
const B2 = 47
const G2 = 43
const A2 = 45

interface Chord {
  start: number
  root: number
  tones: number[]
}

// D | Bm | G A | D, the last chord ringing out.
const chords: Chord[] = [
  { start: 0, root: D2, tones: [62, 66, 69, 74] },
  { start: 4 * BEAT, root: B2, tones: [59, 62, 66, 71] },
  { start: 8 * BEAT, root: G2, tones: [55, 59, 62, 67] },
  { start: 10 * BEAT, root: A2, tones: [57, 61, 64, 69] },
  { start: 13 * BEAT, root: D2, tones: [62, 66, 69, 74] },
]
const FINAL = chords[chords.length - 1].start

// Bell lead: [beat, midi, beats long].
const melody: Array<[number, number, number]> = [
  [1, 69, 1],
  [2, 74, 1],
  [3, 78, 1],
  [5, 78, 0.5],
  [5.5, 76, 0.5],
  [6, 74, 1],
  [7, 71, 1],
  [8, 74, 1],
  [9, 79, 1],
  [10, 76, 3],
  [13, 78, 4],
]

const HITS = [10 * BEAT, FINAL]

function chordAt(t: number) {
  let current = chords[0]
  for (const c of chords) if (t >= c.start) current = c
  return current
}

// Deterministic noise.
function noise(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 31 - 1
  }
}

function addNote(
  out: Float32Array,
  start: number,
  length: number,
  voice: (t: number) => number,
) {
  const from = Math.max(0, Math.round(start * JINGLE_SAMPLE_RATE))
  const to = Math.min(
    out.length,
    Math.round((start + length) * JINGLE_SAMPLE_RATE),
  )
  for (let i = from; i < to; i++) {
    out[i] += voice((i - from) / JINGLE_SAMPLE_RATE)
  }
}

// A band-limited-ish saw from a few harmonics.
const saw = (f: number, t: number, harmonics = 8) => {
  let v = 0
  for (let k = 1; k <= harmonics; k++)
    v += Math.sin(2 * Math.PI * f * k * t) / k
  return v * 0.55
}

const pluck = (f: number) => (t: number) =>
  Math.exp(-t * 9) *
  (Math.sign(Math.sin(2 * Math.PI * f * t)) * 0.35 +
    Math.sin(2 * Math.PI * f * t) * 0.4) *
  0.16

const bell = (f: number, length: number) => (t: number) => {
  const env = Math.min(1, t / 0.01) * Math.exp(-t * (length > 1 ? 1.1 : 2.6))
  const mod = Math.sin(2 * Math.PI * f * 3.5 * t) * 2.2 * Math.exp(-t * 4)
  return Math.sin(2 * Math.PI * f * t + mod) * env * 0.22
}

const bassNote = (f: number, length: number) => (t: number) => {
  const env = Math.min(1, t / 0.005) * Math.exp(-t * (length > 0.5 ? 0.9 : 5))
  return saw(f, t, 5) * env * 0.17
}

const pad = (freqs: number[], length: number) => (t: number) => {
  const attack = Math.min(1, t / 0.25)
  const release = Math.min(1, (length - t) / 0.4)
  let v = 0
  for (const f of freqs) {
    v += saw(f * 1.003, t, 6) + saw(f * 0.997, t, 6)
  }
  return (v / freqs.length) * attack * Math.max(0, release) * 0.1
}

function drumHit(seed: number) {
  const rnd = noise(seed)
  return (t: number) => {
    const body =
      Math.sin(2 * Math.PI * (60 * t + (90 * (1 - Math.exp(-t * 25))) / 25)) *
      Math.exp(-t * 7)
    const snare = rnd() * Math.exp(-t * 11)
    return (body * 0.6 + snare * 0.4) * 0.8
  }
}

// A small Schroeder reverb: parallel combs into series all-passes.
function reverb(input: Float32Array, spread: number) {
  const out = new Float32Array(input.length)
  const combs = [1557, 1617, 1491, 1422].map((d) => d + spread)
  for (const delay of combs) {
    const buffer = new Float32Array(delay)
    let index = 0
    for (let i = 0; i < input.length; i++) {
      const y = buffer[index]
      buffer[index] = input[i] + y * 0.82
      out[i] += y * 0.25
      index = (index + 1) % delay
    }
  }
  for (const delay of [225 + spread, 556 + spread]) {
    const buffer = new Float32Array(delay)
    let index = 0
    for (let i = 0; i < out.length; i++) {
      const buffered = buffer[index]
      const y = -out[i] + buffered
      buffer[index] = out[i] + buffered * 0.5
      out[i] = y
      index = (index + 1) % delay
    }
  }
  return out
}

export function synthesizeJingle() {
  const length = Math.round(JINGLE_DURATION * JINGLE_SAMPLE_RATE)
  const dry = new Float32Array(length)

  // Pads and bass follow the chords.
  chords.forEach((chord, i) => {
    const end = i + 1 < chords.length ? chords[i + 1].start : JINGLE_DURATION
    const ring = i === chords.length - 1
    addNote(
      dry,
      chord.start,
      end - chord.start,
      pad(chord.tones.map(hz), end - chord.start),
    )
    if (ring) {
      addNote(dry, chord.start, end - chord.start, bassNote(hz(D2), 2))
      addNote(dry, chord.start, end - chord.start, bassNote(hz(D3), 2))
    }
  })
  for (let t = 0; t < FINAL - 1e-6; t += EIGHTH) {
    const chord = chordAt(t)
    addNote(dry, t, EIGHTH, bassNote(hz(chord.root), EIGHTH * 0.9))
  }

  // Plucked arpeggio up and down the chord, in eighths.
  const pattern = [0, 1, 2, 3, 2, 1, 2, 3]
  let step = 0
  for (let t = 0; t < FINAL - 1e-6; t += EIGHTH) {
    const tone = chordAt(t).tones[pattern[step % pattern.length]]
    addNote(dry, t, EIGHTH * 2, pluck(hz(tone + 12)))
    step++
  }

  for (const [beat, note, beats] of melody) {
    const len = Math.min(beats * BEAT + 1, JINGLE_DURATION - beat * BEAT)
    addNote(dry, beat * BEAT, len, bell(hz(note), beats * BEAT))
  }

  HITS.forEach((t, i) => addNote(dry, t, 1.6, drumHit(17 + i)))

  // Stereo from two slightly different reverbs, then a fade at the end.
  const wetL = reverb(dry, 0)
  const wetR = reverb(dry, 23)
  const left = new Float32Array(length)
  const right = new Float32Array(length)
  const fadeFrom = (JINGLE_DURATION - 1.2) * JINGLE_SAMPLE_RATE
  for (let i = 0; i < length; i++) {
    const fade =
      i < fadeFrom ? 1 : Math.max(0, (length - i) / (length - fadeFrom))
    left[i] = (dry[i] * 0.75 + wetL[i] * 0.35) * fade
    right[i] = (dry[i] * 0.75 + wetR[i] * 0.35) * fade
  }

  // Normalise to -1 dBFS.
  let peak = 0
  for (let i = 0; i < length; i++) {
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]))
  }
  const gain = peak > 0 ? 10 ** (-1 / 20) / peak : 1
  for (let i = 0; i < length; i++) {
    left[i] *= gain
    right[i] *= gain
  }
  return { left, right }
}

export function encodeWav(left: Float32Array, right: Float32Array) {
  const frames = left.length
  const data = Buffer.alloc(frames * 4)
  for (let i = 0; i < frames; i++) {
    const l = Math.max(-1, Math.min(1, left[i]))
    const r = Math.max(-1, Math.min(1, right[i]))
    data.writeInt16LE(Math.round(l * 32767), i * 4)
    data.writeInt16LE(Math.round(r * 32767), i * 4 + 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(2, 22) // stereo
  header.writeUInt32LE(JINGLE_SAMPLE_RATE, 24)
  header.writeUInt32LE(JINGLE_SAMPLE_RATE * 4, 28)
  header.writeUInt16LE(4, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

let pending: Promise<string> | undefined

// The jingle's WAV file, generated on first use.
export function builtInJinglePath() {
  pending ??= (async () => {
    const file = path.join(
      dataDir(),
      'generated',
      `jingle-1989-v${JINGLE_VERSION}.wav`,
    )
    const exists = await fs.stat(file).then(
      () => true,
      () => false,
    )
    if (!exists) {
      const { left, right } = synthesizeJingle()
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(`${file}.part`, encodeWav(left, right))
      await fs.rename(`${file}.part`, file)
    }
    return file
  })()
  pending.catch(() => (pending = undefined))
  return pending
}
