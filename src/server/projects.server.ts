import fs from 'node:fs/promises'
import { desc, eq } from 'drizzle-orm'
import { createProjectDoc } from '#/lib/project'
import type { ProjectDoc } from '#/lib/project'
import { projectMediaDir } from '#/server/config.server'
import { projects } from '#/server/db/schema'
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

export function findProject(db: Db, id: string) {
  return db.select().from(projects).where(eq(projects.id, id)).get()
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
