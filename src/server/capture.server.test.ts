import { describe, expect, it } from 'vitest'
import { frameTurns } from './capture.server'

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
