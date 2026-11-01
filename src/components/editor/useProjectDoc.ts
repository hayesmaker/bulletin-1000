import { useCallback, useEffect, useRef, useState } from 'react'
import { projectDocSchema } from '#/lib/project'
import type { ProjectDoc } from '#/lib/project'
import { updateProject } from '#/server/projects.functions'

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'invalid' | 'error'

const SAVE_DELAY = 800

// The doc being edited. Changes are saved a moment after the last edit, as
// long as the doc is valid.
export function useProjectDoc(projectId: string, initial: ProjectDoc) {
  const [doc, setDoc] = useState(initial)
  const [status, setStatus] = useState<SaveStatus>('saved')
  const [error, setError] = useState<string>()
  const saved = useRef(initial)
  const latest = useRef(initial)
  latest.current = doc

  const update = useCallback(
    (change: (doc: ProjectDoc) => ProjectDoc) => setDoc(change),
    [],
  )

  useEffect(() => {
    if (doc === saved.current) return
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

  return { doc, update, status, error }
}

export function useDebounced<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
