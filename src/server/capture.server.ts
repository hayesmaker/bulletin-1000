import { once } from 'node:events'
import os from 'node:os'
import { chromium } from 'playwright-core'
import type { Browser } from 'playwright-core'
import type { Writable } from 'node:stream'
import { stage } from '#/composition/theme'

// Drives the render page (/render/:projectId) in headless Google Chrome:
// steps the composition frame by frame and writes each frame as a PNG.
// Chrome rather than Playwright's bundled Chromium, which can't decode
// H.264/AAC. Set CHROME_PATH to use a specific executable.
//
// Several pages render in parallel, taking frames in turn (page k renders
// frames k, k + n, k + 2n, …), and the frames are written out in order. The
// composition is deterministic, so which page renders a frame doesn't
// matter. Screenshots go through the DevTools protocol with
// optimizeForSpeed, which is still lossless PNG but encodes much faster.

const LOAD_TIMEOUT_MS = 60_000
const MAX_PAGES = 4

// Pages to render with: RENDER_PAGES, or half the CPU cores up to 4.
export function renderPageCount() {
  const set = Number(process.env.RENDER_PAGES)
  if (Number.isInteger(set) && set > 0) return set
  return Math.min(MAX_PAGES, Math.max(1, Math.floor(os.cpus().length / 2)))
}

interface CaptureOptions {
  url: string
  frameCount: number
  out: Writable
  // Called for each frame once it has been written, in order.
  onFrame: (frame: number) => void
  // Checked between frames; return true to stop early.
  cancelled?: () => boolean
  pages?: number
}

const clip = { x: 0, y: 0, width: stage.width, height: stage.height, scale: 1 }

async function openRenderPage(
  browser: Browser,
  url: string,
  frameCount: number,
) {
  const page = await browser.newPage({
    viewport: { width: stage.width, height: stage.height },
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
        format: 'png',
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

export async function captureFrames({
  url,
  frameCount,
  out,
  onFrame,
  cancelled,
  pages = renderPageCount(),
}: CaptureOptions) {
  const browser = await chromium.launch(
    process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : { channel: 'chrome' },
  )
  try {
    const count = Math.max(1, Math.min(pages, frameCount))
    const renderers = await Promise.all(
      Array.from({ length: count }, () =>
        openRenderPage(browser, url, frameCount),
      ),
    )
    const turns = frameTurns()

    await Promise.all(
      renderers.map(async (renderer, k) => {
        try {
          for (let frame = k; frame < frameCount; frame += count) {
            if (turns.stopped) return
            if (cancelled?.()) return turns.stop()
            const png = await renderer.capture(frame)
            if (!(await turns.wait(frame))) return
            if (!out.write(png)) await once(out, 'drain')
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
    await browser.close()
  }
}
