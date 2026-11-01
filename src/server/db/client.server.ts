import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { databasePath, migrationsDir } from '#/server/config.server'
import * as schema from './schema'

export type Db = ReturnType<typeof openDb>

export function openDb(file: string) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle({ client: sqlite, schema })
  migrate(db, { migrationsFolder: migrationsDir() })
  return db
}

let db: Db | undefined

// Opened lazily on first use, applying any pending migrations.
export function getDb() {
  db ??= openDb(databasePath())
  return db
}
