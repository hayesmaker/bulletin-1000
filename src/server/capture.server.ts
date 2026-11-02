import { once } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import { chromium } from 'playwright-core'
import type { Browser } from 'playwright-core'
import type { Writable } from 'node:stream'

// Drives the render page (/render/:projectId) in headless Google Chrome:
// steps the composition frame by frame and writes each frame as an image.
// Chrome rather than Playwright's bundled Chromium, which can't decode
// H.264/AAC. Set CHROME_PATH to use a specific executable.
//
// Several pages render in parallel, taking frames in turn (page k renders
// frames k, k + n, k + 2n, …), and the frames are written out in order. The
// composition is deterministic, so which page renders a frame doesn't
// matter. Each page gets its own browser: Chrome draws all of a browser's
// pages in one GPU process, which otherwise becomes the bottleneck.
//
// Chrome draws with the GPU when there is one (RENDER_GPU), which makes the
// filter effects several times faster; otherwise it draws in software.
// Frames are PNG (lossless), or high-quality JPEG when the video has
// effects: grain makes PNG slow to encode and large, and JPEG's loss is
// hidden under the grain and the final H.264 encode.

const LOAD_TIMEOUT_MS = 60_000
const MAX_PAGES = 8
const JPEG_QUALITY = 95

// Pages to render with: RENDER_PAGES, or half the CPU cores up to 8.
export function renderPageCount() {
  const set = Number(process.env.RENDER_PAGES)
  if (Number.isInteger(set) && set > 0) return set
  return Math.min(MAX_PAGES, Math.max(1, Math.floor(os.cpus().length / 2)))
}

// Whether to draw with the GPU: RENDER_GPU=1 or 0, or by default when the
// machine has a GPU render device (Linux).
export function useGpu(env = process.env.RENDER_GPU) {
  if (env === '1') return true
  if (env === '0') return false
  try {
    return fs.readdirSync('/dev/dri').some((d) => d.startsWith('renderD'))
  } catch {
    return false
  }
}

const GPU_ARGS = [
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--use-gl=angle',
  '--use-angle=gl-egl',
]

function launchBrowser(gpu: boolean) {
  return chromium.launch({
    ...(process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : { channel: 'chrome' as const }),
    args: gpu ? GPU_ARGS : [],
  })
}

export type FrameFormat = 'png' | 'jpeg'

interface Size {
  width: number
  height: number
}

interface CaptureOptions {
  url: string
  frameCount: number
  // The stage size in pixels.
  size: Size
  format?: FrameFormat
  out: Writable
  // Called for each frame once it has been written, in order.
  onFrame: (frame: number) => void
  // Checked between frames; return true to stop early.
  cancelled?: () => boolean
  pages?: number
}

async function openRenderPage(
  browser: Browser,
  url: string,
  frameCount: number,
  size: Size,
  format: FrameFormat,
) {
  const { width, height } = size
  const clip = { x: 0, y: 0, width, height, scale: 1 }
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  })
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto(url, { timeout: LOAD_TIMEOUT_MS })
  await page
    .waitForFunction(() => window.composition, null, {
      timeout: LOAD_TIMEOUT_MS,
    })
    .catch(() => {
      throw new Error(
        `The render page didn't load${errors.length ? `: ${errors[0]}` : ''}`,
      )
    })
  const pageFrames = await page.evaluate(() => window.composition!.frameCount)
  if (pageFrames !== frameCount) {
    throw new Error(
      `The render page has ${pageFrames} frames, expected ${frameCount}`,
    )
  }
  const cdp = await page.context().newCDPSession(page)

  return {
    errors,
    async capture(frame: number) {
      await page.evaluate((n) => window.composition!.renderFrame(n), frame)
      const { data } = await cdp.send('Page.captureScreenshot', {
        ...(format === 'jpeg'
          ? { format: 'jpeg', quality: JPEG_QUALITY }
          : { format: 'png' }),
        clip,
        optimizeForSpeed: true,
      })
      return Buffer.from(data, 'base64')
    },
  }
}

// Hands out turns in frame order, so pages finishing out of order still
// write their frames in sequence. wait() resolves true when it's the
// frame's turn, or false once the capture has stopped.
export function frameTurns() {
  let next = 0
  let stopped = false
  const waiting = new Map<number, (go: boolean) => void>()
  return {
    wait(frame: number) {
      if (stopped) return Promise.resolve(false)
      if (frame === next) return Promise.resolve(true)
      return new Promise<boolean>((resolve) => waiting.set(frame, resolve))
    },
    done() {
      next++
      waiting.get(next)?.(true)
      waiting.delete(next)
    },
    // Releases every waiting page, e.g. when one fails or is cancelled.
    stop() {
      stopped = true
      for (const resolve of waiting.values()) resolve(false)
      waiting.clear()
    },
    get stopped() {
      return stopped
    },
  }
}

// Opens `count` render pages, each in its own browser. If the GPU can't be
// used, starts again drawing in software.
async function openRenderers(
  count: number,
  open: (browser: Browser) => ReturnType<typeof openRenderPage>,
) {
  const attempt = async (gpu: boolean) => {
    const browsers: Browser[] = []
    try {
      const renderers = await Promise.all(
        Array.from({ length: count }, async () => {
          const browser = await launchBrowser(gpu)
          browsers.push(browser)
          return open(browser)
        }),
      )
      return { browsers, renderers }
    } catch (error) {
      await Promise.all(browsers.map((b) => b.close()))
      throw error
    }
  }
  if (!useGpu()) return attempt(false)
  try {
    return await attempt(true)
  } catch (error) {
    console.warn('Rendering with the GPU failed; using software.', error)
    return attempt(false)
  }
}

export async function captureFrames({
  url,
  frameCount,
  size,
  format = 'png',
  out,
  onFrame,
  cancelled,
  pages = renderPageCount(),
}: CaptureOptions) {
  const count = Math.max(1, Math.min(pages, frameCount))
  const { browsers, renderers } = await openRenderers(count, (browser) =>
    openRenderPage(browser, url, frameCount, size, format),
  )
  try {
    const turns = frameTurns()

    await Promise.all(
      renderers.map(async (renderer, k) => {
        try {
          for (let frame = k; frame < frameCount; frame += count) {
            if (turns.stopped) return
            if (cancelled?.()) return turns.stop()
            const image = await renderer.capture(frame)
            if (!(await turns.wait(frame))) return
            if (!out.write(image)) await once(out, 'drain')
            onFrame(frame)
            turns.done()
          }
        } catch (error) {
          turns.stop()
          throw error
        }
      }),
    )
    if (turns.stopped) return
    const error = renderers.flatMap((r) => r.errors)[0]
    if (error) throw new Error(error)
  } finally {
    await Promise.all(browsers.map((b) => b.close()))
  }
}
