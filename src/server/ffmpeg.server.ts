import { spawn } from 'node:child_process'
import type { AssetMetadata } from '#/server/db/schema'

// Thin wrappers around the host's ffmpeg/ffprobe. Arguments are passed as an
// array (no shell), so file names never need escaping.

export const OUTPUT_FPS = 25

function run(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else {
        const detail = stderr.trim().split('\n').slice(-3).join('\n')
        reject(new Error(`${command} exited with code ${code}: ${detail}`))
      }
    })
  })
}

interface ProbeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  avg_frame_rate?: string
  disposition?: { attached_pic?: number }
}

export interface ProbeResult extends AssetMetadata {
  hasVideo: boolean
  // True for still-image codecs (png, mjpeg, ...) rather than video.
  isStill: boolean
}

const STILL_CODECS = new Set(['png', 'mjpeg', 'gif', 'webp', 'bmp', 'tiff'])

function parseRate(rate: string | undefined) {
  if (!rate) return undefined
  const [num, den] = rate.split('/').map(Number)
  return den ? num / den : undefined
}

export async function probe(file: string): Promise<ProbeResult> {
  const out = await run('ffprobe', [
    '-v',
    'error',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    file,
  ])
  const json = JSON.parse(out) as {
    streams?: ProbeStream[]
    format?: { duration?: string }
  }
  const streams = json.streams ?? []
  const video = streams.find(
    (s) => s.codec_type === 'video' && !s.disposition?.attached_pic,
  )
  const duration = Number(json.format?.duration)
  return {
    hasVideo: Boolean(video),
    isStill: Boolean(video?.codec_name && STILL_CODECS.has(video.codec_name)),
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
    width: video?.width,
    height: video?.height,
    fps: parseRate(video?.avg_frame_rate),
    duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
  }
}

// H.264/AAC at a constant 25fps, square pixels, no bigger than the 1440×1080
// output frame. Smaller (e.g. native retro resolution) clips keep their size.
export function transcodeVideo(input: string, output: string) {
  return run('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-i',
    input,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-vf',
    [
      'scale=round(iw*sar/2)*2:ih',
      'setsar=1',
      "scale='min(iw,1440)':'min(ih,1080)':force_original_aspect_ratio=decrease:force_divisible_by=2",
      `fps=${OUTPUT_FPS}`,
    ].join(','),
    '-fps_mode',
    'cfr',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    output,
  ])
}

export function transcodeAudio(input: string, output: string) {
  return run('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-i',
    input,
    '-map',
    '0:a:0',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-movflags',
    '+faststart',
    output,
  ])
}

export const THUMBNAIL_WIDTH = 320

// A JPEG frame at `at` seconds (0 for images), 320px wide.
export function makeThumbnail(input: string, output: string, at = 0) {
  return run('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-ss',
    String(at),
    '-i',
    input,
    '-frames:v',
    '1',
    '-vf',
    `scale=${THUMBNAIL_WIDTH}:-2`,
    '-q:v',
    '4',
    output,
  ])
}
