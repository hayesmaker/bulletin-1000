import fs from 'node:fs/promises'
import { and, desc, eq, inArray } from 'drizzle-orm'
import {
  assetIdsInDoc,
  createProjectDoc,
  projectDocSchema,
} from '#/lib/project'
import type { ProjectDoc } from '#/lib/project'
import { projectMediaDir } from '#/server/config.server'
import { assets, projects } from '#/server/db/schema'
import type { ProjectRow } from '#/server/db/schema'
import type { Db } from '#/server/db/client.server'

export function listProjects(db: Db) {
  return db
    .select({
      id: projects.id,
      title: projects.title,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .orderBy(desc(projects.updatedAt))
    .all()
}

// Stored docs are re-parsed so fields added since they were saved get their
// defaults.
export function findProject(db: Db, id: string): ProjectRow | undefined {
  const row = db.select().from(projects).where(eq(projects.id, id)).get()
  if (!row) return undefined
  const parsed = projectDocSchema.safeParse(row.doc)
  return parsed.success ? { ...row, doc: parsed.data } : row
}

export function insertProject(db: Db, title?: string) {
  const doc = createProjectDoc(title)
  return db
    .insert(projects)
    .values({ id: crypto.randomUUID(), title: doc.title, doc })
    .returning()
    .get()
}

// Drizzle types .get() as always returning a row; it is undefined when no row matched.
export function saveProjectDoc(
  db: Db,
  id: string,
  doc: ProjectDoc,
): ProjectRow | undefined {
  return db
    .update(projects)
    .set({ doc, title: doc.title, updatedAt: new Date() })
    .where(eq(projects.id, id))
    .returning()
    .get()
}

// Asset ids the doc references that aren't assets of this project.
export function foreignAssetIds(db: Db, projectId: string, doc: ProjectDoc) {
  const ids = [...assetIdsInDoc(doc)]
  if (ids.length === 0) return []
  const owned = new Set(
    db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.projectId, projectId), inArray(assets.id, ids)))
      .all()
      .map((a) => a.id),
  )
  return ids.filter((id) => !owned.has(id))
}

// Deletes the project, its asset rows (by cascade) and its media on disk.
export async function removeProject(db: Db, id: string) {
  const deleted = db
    .delete(projects)
    .where(eq(projects.id, id))
    .returning({ id: projects.id })
    .get()
  if (deleted) {
    await fs.rm(projectMediaDir(id), { recursive: true, force: true })
  }
  return Boolean(deleted)
}
