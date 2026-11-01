import { once } from 'node:events'
import { chromium } from 'playwright-core'
import type { Writable } from 'node:stream'
import { stage } from '#/composition/theme'

// Drives the render page (/render/:projectId) in headless Google Chrome:
// steps the composition frame by frame and writes each frame as a PNG.
// Chrome rather than Playwright's bundled Chromium, which can't decode
// H.264/AAC. Set CHROME_PATH to use a specific executable.

const LOAD_TIMEOUT_MS = 60_000

interface CaptureOptions {
  url: string
  frameCount: number
  out: Writable
  onFrame: (frame: number) => void
  // Checked between frames; return true to stop early.
  cancelled?: () => boolean
}

export async function captureFrames({
  url,
  frameCount,
  out,
  onFrame,
  cancelled,
}: CaptureOptions) {
  const browser = await chromium.launch(
    process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : { channel: 'chrome' },
  )
  try {
    const page = await browser.newPage({
      viewport: { width: stage.width, height: stage.height },
      deviceScaleFactor: 1,
    })
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(e.message))

    await page.goto(url, { timeout: LOAD_TIMEOUT_MS })
    await page
      .waitForFunction(() => window.composition, null, {
        timeout: LOAD_TIMEOUT_MS,
      })
      .catch(() => {
        throw new Error(
          `The render page didn't load${pageErrors.length ? `: ${pageErrors[0]}` : ''}`,
        )
      })
    const pageFrames = await page.evaluate(() => window.composition!.frameCount)
    if (pageFrames !== frameCount) {
      throw new Error(
        `The render page has ${pageFrames} frames, expected ${frameCount}`,
      )
    }

    const clip = { x: 0, y: 0, width: stage.width, height: stage.height }
    for (let frame = 0; frame < frameCount; frame++) {
      if (cancelled?.()) return
      await page.evaluate((n) => window.composition!.renderFrame(n), frame)
      const png = await page.screenshot({ clip, type: 'png' })
      if (!out.write(png)) await once(out, 'drain')
      onFrame(frame)
    }
    if (pageErrors.length > 0) throw new Error(pageErrors[0])
  } finally {
    await browser.close()
  }
}
