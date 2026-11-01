import type { AssetRow } from '#/server/db/schema'

// Upload rules and media URLs, shared by the editor and the server.

export type AssetKind = AssetRow['kind']

const MB = 1024 * 1024

export const uploadLimits = {
  video: { maxBytes: 100 * MB, maxDuration: 120 },
  audio: { maxBytes: 50 * MB, maxDuration: 600 },
  image: { maxBytes: 20 * MB, maxDimension: 4096 },
} as const

export const acceptedExtensions: Record<AssetKind, readonly string[]> = {
  video: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
  audio: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'],
}

export function fileExtension(filename: string) {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase()
}

export function kindFromFilename(filename: string): AssetKind | undefined {
  const ext = fileExtension(filename)
  return (Object.keys(acceptedExtensions) as AssetKind[]).find((kind) =>
    acceptedExtensions[kind].includes(ext),
  )
}

export type MediaVariant = 'file' | 'thumb'

export function mediaUrl(assetId: string, variant: MediaVariant = 'file') {
  return `/media/${assetId}/${variant}`
}

export function assetUploadUrl(projectId: string, filename: string) {
  return `/api/projects/${projectId}/assets?name=${encodeURIComponent(filename)}`
}

export function renderFileUrl(renderId: string, download = false) {
  return `/renders/${renderId}/file${download ? '?download' : ''}`
}

// The built-in 1989 splash jingle (served by src/server/jingle.handler.ts).
export const BUILT_IN_JINGLE_URL = '/audio/jingle-1989'

// A generated narration clip (src/server/voice.handler.ts).
export const voiceClipUrl = (clipId: string) => `/voice/${clipId}`
