import { useCallback, useEffect, useRef, useState } from 'react'
import { projectDocSchema } from '#/lib/project'
import type { ProjectDoc } from '#/lib/project'
import { updateProject } from '#/server/projects.functions'
import { createHistory, mapHistory, record, redo, undo } from './history'

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'invalid' | 'error'

const SAVE_DELAY = 800

export type DocChange = (doc: ProjectDoc) => ProjectDoc
export type UpdateDoc = (
  change: DocChange,
  options?: { merge?: string },
) => void

// Elements given a merge key, so a run of edits in one field is one undo step.
const elementKeys = new WeakMap<Element, string>()
let nextElementKey = 0

// The control being edited: a text field or slider handle with focus.
function focusedControlKey() {
  const el = document.activeElement
  if (!el?.matches('input, textarea, [role="slider"]')) return undefined
  let key = elementKeys.get(el)
  if (!key) {
    key = `control-${nextElementKey++}`
    elementKeys.set(el, key)
  }
  return key
}

// Text fields keep their own undo for what's typed in them.
function isTextField(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable || el instanceof HTMLTextAreaElement) return true
  return (
    el instanceof HTMLInputElement &&
    !['checkbox', 'radio', 'range', 'button', 'submit'].includes(el.type)
  )
}

// The doc being edited, with undo/redo. Changes are saved a moment after the
// last edit, as long as the doc is valid.
export function useProjectDoc(projectId: string, initial: ProjectDoc) {
  const [history, setHistory] = useState(() => createHistory(initial))
  const doc = history.present
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [error, setError] = useState<string>()
  const saved = useRef(initial)
  const latest = useRef(initial)
  latest.current = doc

  // Edits made in quick succession with the same merge key (by default the
  // focused field or slider) become one undo step.
  const update = useCallback<UpdateDoc>((change, options) => {
    const key = options?.merge ?? focusedControlKey()
    const at = performance.now()
    setHistory((h) => record(h, change(h.present), { key, at }))
  }, [])

  // Changes every state in the history, so undo can't bring back what it
  // removes (used when an asset is deleted).
  const rewriteHistory = useCallback(
    (change: DocChange) => setHistory((h) => mapHistory(h, change)),
    [],
  )

  const undoChange = useCallback(() => setHistory(undo), [])
  const redoChange = useCallback(() => setHistory(redo), [])

  // Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes, except in text
  // fields, which handle their own.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || isTextField(e.target)) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undoChange()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        redoChange()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undoChange, redoChange])

  useEffect(() => {
    if (doc === saved.current) {
      // E.g. undone back to what's saved.
      setStatus('saved')
      setError(undefined)
      return
    }
    const parsed = projectDocSchema.safeParse(doc)
    if (!parsed.success) {
      setStatus('invalid')
      setError(parsed.error.issues[0]?.message)
      return
    }
    setStatus('pending')
    setError(undefined)
    const timer = setTimeout(() => {
      setStatus('saving')
      updateProject({ data: { id: projectId, doc: parsed.data } })
        .then(() => {
          saved.current = doc
          if (latest.current === doc) setStatus('saved')
        })
        .catch((e: unknown) => {
          setStatus('error')
          setError(e instanceof Error ? e.message : 'Save failed')
        })
    }, SAVE_DELAY)
    return () => clearTimeout(timer)
  }, [doc, projectId])

  useEffect(() => {
    if (status === 'saved') return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [status])

  return {
    doc,
    update,
    rewriteHistory,
    undo: undoChange,
    redo: redoChange,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    status,
    error,
  }
}

export function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
