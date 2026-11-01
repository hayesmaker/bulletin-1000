import { describe, expect, it } from 'vitest'
import {
  HISTORY_LIMIT,
  MERGE_WINDOW_MS,
  createHistory,
  mapHistory,
  record,
  redo,
  undo,
} from './history'

describe('history', () => {
  it('undoes and redoes', () => {
    let h = createHistory(1)
    h = record(h, 2, { at: 0 })
    h = record(h, 3, { at: 0 })
    h = undo(h)
    expect(h.present).toBe(2)
    h = undo(h)
    expect(h.present).toBe(1)
    expect(undo(h)).toBe(h)
    h = redo(h)
    expect(h.present).toBe(2)
    h = redo(h)
    expect(h.present).toBe(3)
    expect(redo(h)).toBe(h)
  })

  it('drops the redo stack on a new edit', () => {
    let h = record(createHistory(1), 2, { at: 0 })
    h = record(undo(h), 5, { at: 0 })
    expect(h.future).toEqual([])
    expect(h.past).toEqual([1])
  })

  it('merges quick edits with the same key', () => {
    let h = createHistory('')
    h = record(h, 'a', { key: 'title', at: 0 })
    h = record(h, 'ab', { key: 'title', at: 300 })
    h = record(h, 'abc', { key: 'title', at: 600 })
    expect(h.past).toEqual([''])
    // A pause or another field starts a new step.
    h = record(h, 'abcd', { key: 'title', at: 600 + MERGE_WINDOW_MS })
    h = record(h, 'abcde', { key: 'publisher', at: 700 + MERGE_WINDOW_MS })
    expect(h.past).toEqual(['', 'abc', 'abcd'])
  })

  it('does not merge into a step that was undone', () => {
    let h = record(createHistory(0), 1, { key: 'k', at: 0 })
    h = undo(h)
    h = record(h, 2, { key: 'k', at: 10 })
    expect(h.past).toEqual([0])
    expect(undo(h).present).toBe(0)
  })

  it('ignores no-op changes and caps its length', () => {
    let h = createHistory(0)
    expect(record(h, 0, { at: 0 })).toBe(h)
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) h = record(h, i, { at: 0 })
    expect(h.past).toHaveLength(HISTORY_LIMIT)
  })

  it('maps every state', () => {
    let h = record(createHistory(1), 2, { at: 0 })
    h = undo(record(h, 3, { at: 0 }))
    h = mapHistory(h, (n) => n * 10)
    expect([h.past, h.present, h.future]).toEqual([[10], 20, [30]])
  })
})
