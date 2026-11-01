import { useCallback, useEffect, useState } from 'react'
import { App } from 'antd'
import { scenesNeedingVoice } from '#/lib/project'
import type { ProjectDoc } from '#/lib/project'
import {
  generateVoiceLine,
  getTtsStatus,
  getVoices,
} from '#/server/narration.functions'
import type { Voice } from '#/server/tts.server'
import type { UpdateDoc } from './useProjectDoc'

export type TtsStatus = Awaited<ReturnType<typeof getTtsStatus>>

// Narration state for the editor: whether TTS is set up, the voices on
// offer, and generating lines. Generated clips are written into the doc
// (so they're undoable and autosaved).
export function useNarration(update: UpdateDoc) {
  const { message } = App.useApp()
  const [status, setStatus] = useState<TtsStatus>()
  const [voices, setVoices] = useState<Voice[]>()
  const [voicesError, setVoicesError] = useState<string>()
  const [generating, setGenerating] = useState<ReadonlySet<string>>(new Set())

  const refreshStatus = useCallback(
    () => getTtsStatus().then(setStatus, () => undefined),
    [],
  )
  useEffect(() => void refreshStatus(), [refreshStatus])

  useEffect(() => {
    if (!status?.provider) return
    getVoices().then(
      (list) => {
        setVoices(list)
        setVoicesError(undefined)
      },
      (e: unknown) =>
        setVoicesError(e instanceof Error ? e.message : 'Couldn’t load voices'),
    )
  }, [status?.provider])

  const mark = (sceneId: string, on: boolean) =>
    setGenerating((current) => {
      const next = new Set(current)
      if (on) next.add(sceneId)
      else next.delete(sceneId)
      return next
    })

  // Generates one scene's line. Returns false if it failed.
  const generate = useCallback(
    async (doc: ProjectDoc, sceneId: string) => {
      const scene = doc.scenes.find((s) => s.id === sceneId)
      const text = scene?.voiceLine?.text.trim()
      const { voiceId } = doc.narration
      if (!text) return true
      if (!voiceId) {
        void message.warning('Choose a narration voice first (Audio tab)')
        return false
      }
      mark(sceneId, true)
      try {
        const clip = await generateVoiceLine({ data: { text, voiceId } })
        update((d) => ({
          ...d,
          scenes: d.scenes.map((s) =>
            s.id === sceneId && s.voiceLine
              ? { ...s, voiceLine: { ...s.voiceLine, clip } }
              : s,
          ),
        }))
        return true
      } catch (e) {
        void message.error(
          e instanceof Error ? e.message : 'Couldn’t generate the line',
        )
        return false
      } finally {
        mark(sceneId, false)
        void refreshStatus()
      }
    },
    [message, update, refreshStatus],
  )

  // Generates every line that needs it, one at a time, stopping at the
  // first failure.
  const generateAll = useCallback(
    async (doc: ProjectDoc) => {
      for (const scene of scenesNeedingVoice(doc)) {
        if (!(await generate(doc, scene.id))) return
      }
    },
    [generate],
  )

  return { status, voices, voicesError, generating, generate, generateAll }
}

export type NarrationState = ReturnType<typeof useNarration>
