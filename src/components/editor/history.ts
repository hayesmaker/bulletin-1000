// Undo/redo history for the project doc. Pure, so it can be unit tested.
// Edits that arrive close together under the same key (typing in one field,
// dragging one slider) merge into a single undo step.

export interface History<T> {
  past: T[]
  present: T
  future: T[]
  // Key and time of the last edit, for merging.
  lastKey?: string
  lastAt?: number
}

export const HISTORY_LIMIT = 100
export const MERGE_WINDOW_MS = 1000

export const createHistory = <T>(present: T): History<T> => ({
  past: [],
  present,
  future: [],
})

export function record<T>(
  h: History<T>,
  next: T,
  { key, at }: { key?: string; at: number },
): History<T> {
  if (next === h.present) return h
  const merge =
    key !== undefined &&
    key === h.lastKey &&
    h.lastAt !== undefined &&
    at - h.lastAt < MERGE_WINDOW_MS &&
    h.past.length > 0
  return {
    past: merge ? h.past : [...h.past, h.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
    lastKey: key,
    lastAt: at,
  }
}

export function undo<T>(h: History<T>): History<T> {
  const previous = h.past.at(-1)
  if (previous === undefined) return h
  return {
    past: h.past.slice(0, -1),
    present: previous,
    future: [h.present, ...h.future],
  }
}

export function redo<T>(h: History<T>): History<T> {
  const [next, ...future] = h.future
  if (next === undefined) return h
  return { past: [...h.past, h.present], present: next, future }
}

// Applies a change to every state in the history, e.g. removing references
// to a deleted asset so undo can't bring them back.
export function mapHistory<T>(h: History<T>, fn: (state: T) => T): History<T> {
  return {
    ...h,
    past: h.past.map(fn),
    present: fn(h.present),
    future: h.future.map(fn),
  }
}
