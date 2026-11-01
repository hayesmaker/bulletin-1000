import path from 'node:path'

// All server-side storage lives under DATA_DIR (default ./data):
//   <DATA_DIR>/bulletin.db              SQLite database
//   <DATA_DIR>/media/<projectId>/...    uploads, thumbnails and renders

export function dataDir() {
  return path.resolve(process.env.DATA_DIR ?? 'data')
}

export function databasePath() {
  return path.join(dataDir(), 'bulletin.db')
}

export function mediaDir() {
  return path.join(dataDir(), 'media')
}

export function projectMediaDir(projectId: string) {
  return path.join(mediaDir(), projectId)
}

export function migrationsDir() {
  return path.resolve(process.env.MIGRATIONS_DIR ?? 'drizzle')
}
