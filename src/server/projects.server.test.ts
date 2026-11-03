import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { projectMediaDir } from '#/server/config.server'
import { openDb } from '#/server/db/client.server'
import type { Db } from '#/server/db/client.server'
import { assets, voiceClips } from '#/server/db/schema'
import {
  findProject,
  foreignAssetIds,
  insertProject,
  listProjects,
  removeProject,
  saveProjectDoc,
  unknownVoiceClipIds,
} from './projects.server'

let tmp: string
let db: Db

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'b1k-test-'))
  process.env.DATA_DIR = tmp
  db = openDb(':memory:')
})

afterEach(() => {
  delete process.env.DATA_DIR
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('projects', () => {
  it('creates a project with a default doc', () => {
    const project = insertProject(db, 'Gyroscope')
    expect(project.title).toBe('Gyroscope')
    expect(project.doc.scenes).toHaveLength(1)
    expect(findProject(db, project.id)?.doc).toEqual(project.doc)
  })

  it('saves the doc and syncs the title', () => {
    const project = insertProject(db)
    const doc = { ...project.doc, title: 'Renamed', publisher: 'Ocean' }
    const saved = saveProjectDoc(db, project.id, doc)
    expect(saved?.title).toBe('Renamed')
    expect(findProject(db, project.id)?.doc.publisher).toBe('Ocean')
    expect(saved!.updatedAt.getTime()).toBeGreaterThanOrEqual(
      project.updatedAt.getTime(),
    )
  })

  it('returns undefined when saving a missing project', () => {
    const doc = insertProject(db).doc
    expect(saveProjectDoc(db, crypto.randomUUID(), doc)).toBeUndefined()
  })

  it('lists projects, most recently updated first', () => {
    const a = insertProject(db, 'A')
    insertProject(db, 'B')
    saveProjectDoc(db, a.id, { ...a.doc, title: 'A2' })
    expect(listProjects(db).map((p) => p.title)).toEqual(['A2', 'B'])
  })

  it('finds asset ids that belong to another project', () => {
    const mine = insertProject(db)
    const theirs = insertProject(db)
    const asset = (projectId: string) =>
      db
        .insert(assets)
        .values({
          id: crypto.randomUUID(),
          projectId,
          kind: 'image',
          originalName: 'box.png',
          mimeType: 'image/png',
          sizeBytes: 10,
          path: `${projectId}/box.png`,
        })
        .returning()
        .get()
    const own = asset(mine.id)
    const foreign = asset(theirs.id)
    const missing = crypto.randomUUID()

    expect(
      foreignAssetIds(db, mine.id, { ...mine.doc, boxArtAssetId: own.id }),
    ).toEqual([])
    expect(
      foreignAssetIds(db, mine.id, {
        ...mine.doc,
        boxArtAssetId: foreign.id,
        scenes: [
          {
            id: crypto.randomUUID(),
            type: 'title-screen',
            assetId: missing,
            duration: 3,
            transitionIn: { type: 'cut' },
            voiceLine: null,
          },
        ],
      }),
    ).toEqual([foreign.id, missing])
  })

  it('deletes the project, its assets and its media folder', async () => {
    const project = insertProject(db)
    db.insert(assets)
      .values({
        id: crypto.randomUUID(),
        projectId: project.id,
        kind: 'image',
        originalName: 'box.png',
        mimeType: 'image/png',
        sizeBytes: 10,
        path: `${project.id}/box.png`,
      })
      .run()
    const dir = projectMediaDir(project.id)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'box.png'), 'x')

    expect(await removeProject(db, project.id)).toBe(true)
    expect(findProject(db, project.id)).toBeUndefined()
    expect(db.select().from(assets).all()).toHaveLength(0)
    expect(fs.existsSync(dir)).toBe(false)
    expect(await removeProject(db, project.id)).toBe(false)
  })
})

describe('unknownVoiceClipIds', () => {
  it('flags voice clips that were never generated', () => {
    const project = insertProject(db, 'Gyroscope')
    const known = 'a'.repeat(64)
    const made = 'b'.repeat(64)
    db.insert(voiceClips)
      .values({ id: known, provider: 'stand-in', voiceId: 'v', path: 'voice/a.mp3', duration: 1, characters: 3 })
      .run() // prettier-ignore
    const line = (id: string) => ({
      text: 'Hi',
      offset: 0,
      voiceId: null,
      settings: null,
      clip: { id, duration: 1, text: 'Hi', voiceId: 'v', settings: null },
    })
    const doc = {
      ...project.doc,
      scenes: [
        { ...project.doc.scenes[0], voiceLine: line(known) },
        {
          ...project.doc.scenes[0],
          id: crypto.randomUUID(),
          voiceLine: line(made),
        },
      ],
    }
    expect(unknownVoiceClipIds(db, doc)).toEqual([made])
  })
})
