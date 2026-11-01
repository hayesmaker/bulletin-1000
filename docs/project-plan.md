# Bulletin 1000 Generator: Project Plan

This is the living plan. Tick items off as they're completed, add new tasks as they're discovered, and record any changed decisions in the Decisions section with the date.

## Vision

A web app that lets users generate their own Bulletin 1000 video magazine-style promotional videos for modern homebrew games on retro computer systems.

**Site map:**

- **Homepage:** includes a promotional video for the tool itself, made with the generator
- **Editor:** the main user input side, where users add assets, enter details and scripts, and generate their videos
- **My Videos:** users see their created content and download their videos

**User inputs (full vision):**

- **Game assets:** cover art, screenshots and gameplay videos, the core of the generated video
- **Scripts:** narration read out by a TTS voice (ElevenLabs)
- **Animations:** predefined transitions and effects between assets, editable later
- **Effects:** filter effects for the output video (e.g. VHS grain, CRT filter)
- **Output format:** 4:3, 16:9 or 9:16

Generated videos should be downloadable and editable later.

**Monetisation:** free / standard / pro plans, details to be decided later.

## Decisions

Updated 2026-11-01.

- **Rendering: hybrid.** Live preview in the browser (a GSAP timeline driving a canvas/DOM composition). Final export on the server via **headless Chromium replay**: Playwright loads the same composition, steps the GSAP timeline frame by frame, and pipes the frames to ffmpeg, which muxes in the audio. One composition codebase serves both preview and export.
- **Database: SQLite via Drizzle ORM + better-sqlite3** (decided 2026-11-01). A project is stored as one validated JSON document (`src/lib/project.ts`), with assets in their own table. Migrations live in `drizzle/` and are applied on startup.
- **Hosting: self-hosted VPS.** SQLite on local disk. Uploaded assets and rendered videos go on local disk under a configurable media directory. ffmpeg and Chromium are installed on the box.
- **Video format: short promo (30–90s), one game per video**, following the structure of the original Bulletin 1000 promos (see [style-guide.md](style-guide.md)).
- **Captions first, narration later.** Like the originals, the MVP relies on on-screen captions and game audio. ElevenLabs TTS (voiceover only, no on-screen presenter) moves to a later milestone.
- **Scene timing:** a gameplay scene lasts as long as its trimmed clip. Card scenes (packshot, title, still screenshot) have a duration the user sets, with sensible defaults.
- **Audio (MVP):**
  - One **continuous music track** (usually the game's own music) plays without restarting at each scene.
  - Its **start point is the user's choice** and defaults to the start of the first gameplay scene, as in the originals, where the intro cards play without music.
  - The source can be an uploaded audio file or the audio taken from one of the gameplay clips.
  - Gameplay clip audio is muted by default, with an optional per-scene "keep clip audio" switch mixed over the music.
  - The splash jingle plays when a splash is selected.
- **Output: 1440×1080 at 25 fps** (4:3, PAL-era frame rate). H.264/AAC MP4.
- **Fonts:** a free Helvetica-style sans for captions and packshot text, plus custom-designed chunky logo type for the 1985 splash. Font choices are defined once in the template theme config so they're easy to change.
- **Splash intros are recreated in code**, not taken from the original footage: the 1985 neon grid uses GSAP/canvas, and the 1989 3D shapes use three.js. The jingle is a sound-alike. Splash is an optional, selectable intro.
- **Brand/rights:** UK IPO, TMview, and WIPO Global Brand Database searches on 2026-11-01 found no "Bulletin 1000" trade marks, and Companies House has no matching company. The splash logo artwork will be a **modified reinterpretation** of the originals, not a copy. Brand text and logo assets live in one place in the code so they can be swapped if needed.
- **Aspect ratio: 4:3 only for the MVP.** 16:9 and 9:16 layouts come later.
- **Look: clean output for the MVP.** CRT/VHS filters come in the effects milestone.
- **Uploads:** gameplay clips are limited (around 100MB or 2 min). Users set in/out points in the editor, and the server transcodes clips to a standard format (H.264/AAC MP4, constant frame rate) with ffmpeg on upload.

## Reference style guide

See [style-guide.md](style-guide.md) for the reference footage and the promo structure the template follows.

## Milestone 1 (MVP): single fixed template, 4:3

Goal: upload assets, fill in game details, arrange scenes, and get one Bulletin 1000-style 4:3 MP4 out. **No auth, no payments, no TTS, no My Videos page.**

### 1. Data layer

- [x] Add SQLite with Drizzle ORM + better-sqlite3, and set up migrations
- [x] Add a configurable data/media directory (env var)
- [x] Define the project schema: a project is a JSON document, so videos stay re-editable. It holds:
  - [x] game title and publisher
  - [x] price/platform pairs
  - [x] box art
  - [x] packshot colour
  - [x] splash choice (none / 1985 / 1989)
  - [x] music track (uploaded file or a source clip, start offset, start point in the timeline)
  - [x] an ordered scene list: each scene has a type, an asset, trim points or a duration, overlay captions, and a "keep clip audio" switch
- [x] Define the asset schema: file path, kind, probed metadata, thumbnail
- [x] Write server functions for project CRUD
- [x] Add Vitest, with tests for the project schema and project queries
- [ ] Check that asset IDs referenced in a project doc belong to that project (once uploads exist)

### 2. Upload pipeline

- [x] Upload endpoint with size and duration limits (`POST /api/projects/:id/assets?name=…`, raw file body streamed to disk). Limits: clips 100MB / 120s, audio 50MB / 10 min, images 20MB / 4096px
- [x] Probe uploads with ffprobe (duration, dimensions, frame rate, audio streams)
- [x] Transcode gameplay clips to H.264/AAC at a constant 25fps, square pixels, capped at 1440×1080 (smaller clips keep their native size)
- [x] Generate thumbnails for clips and images
- [x] Accept audio file uploads for the music track (transcoded to AAC)
- [x] Serial background processing queue; interrupted jobs resume after a restart
- [x] Serve media by asset ID (`/media/:assetId/file|thumb`) with Range support for seeking
- [ ] Decide how to scale low-resolution gameplay into the inset (nearest-neighbour vs smooth). Clips currently keep their native size, so the composition decides.
- [ ] Clean up asset references in the project doc when an asset is deleted (editor step)

### 3. Composition (GSAP template)

- [x] Theme config: fonts, colours, layout and timings in one place (`src/composition/theme.ts`). The font is Archivo, a free variable sans whose width axis covers both the condensed caption and the regular packshot text.
- [x] Deterministic timeline builder (project JSON → schedule → GSAP timeline), with no real-time dependencies. All times are whole frames, and the same frame renders byte-identically across page loads.
- [x] Packshot card (measured from the 1985 reference: box art left, price/platform pairs spread from the top of the box to its bottom; default colour sampled from the reference)
- [x] Publisher logo card (falls back to the publisher name) and title screen card
- [x] Gameplay scene: 4:3 inset, "TITLE – Publisher" caption, overlay captions; screenshot scene with the same layout
- [x] Cuts and short dissolves between scenes (dissolves overlap the previous scene, capped at half of either scene)
- [x] Preview player with audio sync (music start point and fade-out, "keep clip audio")
- [x] Render page (`/render/:projectId`) exposing `window.composition.renderFrame(n)` for the exporter
- [x] `npm run seed:demo` to create a demo project before the editor exists
- [ ] Decide inset scaling for low-res gameplay: `insetScaling` in the theme is `'smooth'` (like the analogue originals); `'pixelated'` keeps pixel art crisp. Could become a per-project option.
- [ ] Replace the splash placeholder card (step 6)

### 4. Editor UI

- [ ] Game details form (title, publisher, prices/platforms, packshot colour)
- [ ] Asset bin with uploads and thumbnails
- [ ] Ordered scene list (drag to reorder, including the intro cards)
- [ ] Clip trimmer (in/out points)
- [ ] Caption editor
- [ ] Splash picker and music track picker (source, start point)
- [ ] Embedded preview

### 5. Export

- [ ] SQLite-backed render job queue with a single worker
- [ ] Playwright frame capture at 1440×1080, 25 fps. Use Google Chrome (`channel: 'chrome'` or its executable path) rather than Playwright's bundled Chromium, which ships without H.264/AAC decoders.
- [ ] ffmpeg encode, mixing music, clip audio, and jingle
- [ ] Render progress and status in the UI
- [ ] Download link for the finished MP4

### 6. Splash recreations

- [ ] 1985 neon grid splash (GSAP/canvas, reinterpreted logo)
- [ ] 1989 3D shapes splash (three.js, reinterpreted logo)
- [ ] Sound-alike jingle

## Later milestones

- [ ] ElevenLabs TTS narration
  - server-side API key, curated voices, rate limiting
  - audio cached by a hash of text and voice
  - each scene can have an optional voice line that extends the scene's length
  - by default narration starts with the music at the first gameplay scene; the user can change this
- [ ] 16:9 and 9:16 layouts
- [ ] Filter effects (CRT, VHS grain, scanlines, colour bleed), most likely as WebGL shaders so preview and export match
- [ ] Clerk auth and the My Videos page (list, re-edit, download)
- [ ] Selectable and editable transitions/animations
- [ ] Additional templates (e.g. a WHSmith-style compilation)
- [ ] Homepage with a promo video made by the tool itself
- [ ] Monetisation tiers (free / standard / pro), where limits might include render length, watermark, resolution, and TTS characters

## Open questions

- Retention policy for uploaded media and renders on the VPS (deferred)
