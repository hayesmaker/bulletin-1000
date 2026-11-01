import path from 'node:path'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: path.join(process.env.DATA_DIR ?? 'data', 'bulletin.db'),
  },
})
