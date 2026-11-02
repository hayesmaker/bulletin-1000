import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { frameTurns, useGpu } from './capture.server'

describe('frameTurns', () => {
  it('lets frames through in order, whenever they arrive', async () => {
    const turns = frameTurns()
    const written: number[] = []
    const write = async (frame: number) => {
      if (await turns.wait(frame)) {
        written.push(frame)
        turns.done()
      }
    }
    await Promise.all([write(2), write(1), write(3), write(0)])
    expect(written).toEqual([0, 1, 2, 3])
  })

  it('releases waiting frames when stopped', async () => {
    const turns = frameTurns()
    const waiting = turns.wait(3)
    turns.stop()
    await expect(waiting).resolves.toBe(false)
    await expect(turns.wait(0)).resolves.toBe(false)
  })
})

describe('useGpu', () => {
  it('follows RENDER_GPU when set', () => {
    expect(useGpu('1')).toBe(true)
    expect(useGpu('0')).toBe(false)
  })

  it('otherwise looks for a GPU render device', () => {
    let hasDevice = false
    try {
      hasDevice = fs
        .readdirSync('/dev/dri')
        .some((d) => d.startsWith('renderD'))
    } catch {
      // No /dev/dri: no GPU.
    }
    expect(useGpu(undefined)).toBe(hasDevice)
  })
})
