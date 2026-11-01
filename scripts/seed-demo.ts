// Creates a demo project to preview the composition without the editor.
//
//   npm run seed:demo -- [--box art.png] [--logo logo.png] [--title title.png]
//                        [--clip a.mp4 --clip b.mp4] [--music tune.mp3]
//                        [--splash 1985|1989]
//
// Any file not given is generated with ffmpeg. Uses DATA_DIR like the server.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { parseArgs } from 'node:util'
import { DEFAULT_DUCKING, projectDocSchema } from '#/lib/project'
import type { ProjectDoc, Scene } from '#/lib/project'
import { enqueueProcessing, saveUpload } from '#/server/assets.server'
import { getDb } from '#/server/db/client.server'
import { insertProject, saveProjectDoc } from '#/server/projects.server'

const { values } = parseArgs({
  options: {
    box: { type: 'string' },
    logo: { type: 'string' },
    title: { type: 'string' },
    clip: { type: 'string', multiple: true },
    music: { type: 'string' },
    splash: { type: 'string', default: '1985' },
  },
})

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'b1k-seed-'))
const ffmpeg = (...args: Array<string>) =>
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...args])

function generated(name: string, ...args: Array<string>) {
  const file = path.join(tmp, name)
  ffmpeg(...args, file)
  return file
}

const box =
  values.box ??
  generated(
    'box.png',
    '-f', 'lavfi', '-i', 'gradients=size=300x530:c0=0x1a8fd0:c1=0x101040:duration=1',
    '-frames:v', '1',
  ) // prettier-ignore
const clips = values.clip ?? [
  generated(
    'clip1.mp4',
    '-f', 'lavfi', '-i', 'testsrc2=size=320x256:rate=50:duration=6',
    '-f', 'lavfi', '-i', 'sine=frequency=330:duration=6',
    '-shortest',
  ), // prettier-ignore
  generated(
    'clip2.mp4',
    '-f', 'lavfi', '-i', 'mandelbrot=size=320x256:rate=25',
    '-t', '5',
  ), // prettier-ignore
]
const music =
  values.music ??
  generated(
    'music.wav',
    '-f', 'lavfi', '-i', 'sine=frequency=220:beep_factor=4:duration=30',
  ) // prettier-ignore

const db = getDb()
const project = insertProject(db, 'Gyroscope')

async function upload(file: string) {
  const asset = await saveUpload(db, {
    projectId: project.id,
    filename: path.basename(file),
    body: Readable.toWeb(
      fs.createReadStream(file),
    ) as ReadableStream<Uint8Array>,
  })
  await enqueueProcessing(db, asset.id)
  return asset
}

const boxAsset = await upload(box)
const logoAsset = values.logo ? await upload(values.logo) : undefined
const titleAsset = values.title ? await upload(values.title) : undefined
const clipAssets = []
for (const clip of clips) clipAssets.push(await upload(clip))
const musicAsset = await upload(music)

const id = () => crypto.randomUUID()
const scenes: Array<Scene> = [
  {
    id: id(),
    type: 'publisher-logo',
    assetId: logoAsset?.id ?? null,
    duration: 2.5,
    transitionIn: 'cut',
  },
  { id: id(), type: 'packshot', duration: 4, transitionIn: 'cut' },
  ...(titleAsset
    ? [
        {
          id: id(),
          type: 'title-screen' as const,
          assetId: titleAsset.id,
          duration: 3,
          transitionIn: 'cut' as const,
        },
      ]
    : []),
  ...clipAssets.map((clip, i): Scene => ({
    id: id(),
    type: 'gameplay',
    assetId: clip.id,
    trimIn: 0,
    trimOut: Math.min(clip.metadata.duration ?? 5, 6),
    keepClipAudio: false,
    duckMusic: true,
    transitionIn: i === 0 ? 'cut' : 'dissolve',
    captions:
      i === 0
        ? [{ id: id(), text: 'Superb graphics', start: 1, end: 3.5 }]
        : [],
  })),
  { id: id(), type: 'packshot', duration: 4, transitionIn: 'cut' },
]

const doc: ProjectDoc = {
  ...project.doc,
  title: 'Gyroscope',
  publisher: 'Melbourne House',
  prices: [
    { platform: 'Spectrum', price: '£7.95' },
    { platform: 'C64/BBC B\nAmstrad', price: '£8.95' },
  ],
  boxArtAssetId: boxAsset.id,
  splash: values.splash === '1989' ? '1989' : '1985',
  music: {
    source: { type: 'upload', assetId: musicAsset.id },
    sourceOffset: 0,
    startAt: { type: 'first-gameplay' },
    volume: 0.8,
    ducking: DEFAULT_DUCKING,
  },
  scenes,
}
saveProjectDoc(db, project.id, projectDocSchema.parse(doc))
fs.rmSync(tmp, { recursive: true, force: true })

console.log(`Demo project created: /projects/${project.id}`)
console.log(`Preview: /projects/${project.id}/preview`)
