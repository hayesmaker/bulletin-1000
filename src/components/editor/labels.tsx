import {
  AppstoreOutlined,
  FileImageOutlined,
  PictureOutlined,
  ShopOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'
import { mediaUrl } from '#/lib/assets'
import type { SceneType } from '#/lib/project'
import { fps } from '#/composition/theme'
import type { AssetRow } from '#/server/db/schema'

export const sceneLabels: Record<SceneType, string> = {
  'publisher-logo': 'Publisher logo',
  packshot: 'Packshot',
  'title-screen': 'Title screen',
  screenshot: 'Screenshot',
  gameplay: 'Gameplay',
}

export const sceneIcons: Record<SceneType, ReactNode> = {
  'publisher-logo': <ShopOutlined />,
  packshot: <AppstoreOutlined />,
  'title-screen': <FileImageOutlined />,
  screenshot: <PictureOutlined />,
  gameplay: <VideoCameraOutlined />,
}

// Seconds as 0:00:00 (minutes, seconds, frames).
export function formatTime(t: number) {
  const minutes = Math.floor(t / 60)
  const seconds = Math.floor(t % 60)
  const frames = Math.round((t * fps) % fps) % fps
  return `${minutes}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`
}

export function formatSeconds(t: number) {
  return `${Number(t.toFixed(2))}s`
}

export function thumbUrl(asset: AssetRow | undefined) {
  return asset?.thumbnailPath ? mediaUrl(asset.id, 'thumb') : undefined
}
