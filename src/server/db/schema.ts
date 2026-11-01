import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'
import type { ProjectDoc } from '#/lib/project'

const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`)

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  // Copied from doc.title on every save, for listing without parsing JSON.
  title: text('title').notNull(),
  doc: text('doc', { mode: 'json' }).$type<ProjectDoc>().notNull(),
  createdAt: createdAt(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch('subsec') * 1000)`),
})

export const assetKinds = ['video', 'image', 'audio'] as const
export const assetStatuses = ['processing', 'ready', 'failed'] as const

export interface AssetMetadata {
  duration?: number
  width?: number
  height?: number
  fps?: number
  hasAudio?: boolean
}

export const assets = sqliteTable(
  'assets',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: assetKinds }).notNull(),
    status: text('status', { enum: assetStatuses })
      .notNull()
      .default('processing'),
    error: text('error'),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    // Paths are relative to the media directory.
    path: text('path').notNull(),
    thumbnailPath: text('thumbnail_path'),
    metadata: text('metadata', { mode: 'json' })
      .$type<AssetMetadata>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (t) => [index('assets_project_id_idx').on(t.projectId)],
)

export const renderStatuses = ['queued', 'rendering', 'done', 'failed'] as const

// An export of a project to MP4. The doc is copied when the render is
// requested, so later edits don't change a render in progress.
export const renders = sqliteTable(
  'renders',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    status: text('status', { enum: renderStatuses })
      .notNull()
      .default('queued'),
    // 0–1 while rendering.
    progress: real('progress').notNull().default(0),
    error: text('error'),
    doc: text('doc', { mode: 'json' }).$type<ProjectDoc>().notNull(),
    // Relative to the media directory, set when done.
    path: text('path'),
    sizeBytes: integer('size_bytes'),
    duration: real('duration'),
    createdAt: createdAt(),
    finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
  },
  (t) => [index('renders_project_id_idx').on(t.projectId)],
)

export type ProjectRow = typeof projects.$inferSelect
export type AssetRow = typeof assets.$inferSelect
export type RenderRow = typeof renders.$inferSelect
