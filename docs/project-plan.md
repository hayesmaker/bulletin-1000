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

Updated 2026-11-02.

- **Rendering: hybrid.** Live preview in the browser (a GSAP timeline driving a canvas/DOM composition). Final export on the server via **headless Chromium replay**: Playwright loads the same composition, steps the GSAP timeline frame by frame, and pipes the frames to ffmpeg, which muxes in the audio. One composition codebase serves both preview and export.
- **Database: SQLite via Drizzle ORM + better-sqlite3** (decided 2026-11-01). A project is stored as one validated JSON document (`src/lib/project.ts`), with assets in their own table. Migrations live in `drizzle/` and are applied on startup.
- **Hosting: self-hosted VPS.** SQLite on local disk. Uploaded assets and rendered videos go on local disk under a configurable media directory. ffmpeg and Chromium are installed on the box.
- **Video format: short promo (30–90s), one game per video**, following the structure of the original Bulletin 1000 promos (see [style-guide.md](style-guide.md)).
- **Captions first, narration later.** Like the originals, the MVP relies on on-screen captions and game audio. ElevenLabs TTS (voiceover only, no on-screen presenter) moves to a later milestone.
- **Narration (decided 2026-11-01):**
  - Each scene can carry one voice line, starting at an offset into the scene. This replaces the earlier "narration starts with the music" idea.
  - Card scenes stretch to fit their line, plus a 0.5s tail. On gameplay scenes a longer line runs on over the cut, like a real voiceover, and the editor warns about overlapping lines.
  - Lines are only generated when the user asks (Generate / Generate all), never automatically, to protect credits. Export is blocked until every line is up to date.
  - Generated audio is cached globally by a hash of provider, model, voice and text (`voice_clips` table, `DATA_DIR/voice/`), so unchanged lines cost nothing.
  - Limits: a global daily character cap (`TTS_DAILY_CHARACTERS`, default 20,000) and one request at a time, plus the key's own character limit set in ElevenLabs. Per-user limits come with auth.
  - **Quotas (decided 2026-11-02):** users never see the ElevenLabs account's quota; that's the operator's cost. Each user gets their own TTS credits from their plan, so this waits for auth and monetisation. Until then the global daily cap protects the account.
  - The music ducks under narration at the project's ducking level.
  - **Per-line settings and pauses (2026-11-02):** a line can override the project voice and the voice settings. ElevenLabs has no global pause rules (such as "after every comma"), so pauses are explicit markers in the text, converted to each model's syntax. Punctuation still shapes the read: full stops pause longer than commas, and dashes and ellipses add short pauses.
  - Without a key, `TTS_FAKE=1` gives a stand-in voice (tones) for development and tests.
- **Scene timing:** a gameplay scene lasts as long as its trimmed clip. Card scenes (packshot, title, still screenshot) have a duration the user sets, with sensible defaults.
- **Audio (MVP):**
  - One **continuous music track** (usually the game's own music) plays without restarting at each scene.
  - Its **start point is the user's choice** and defaults to the start of the first gameplay scene, as in the originals, where the intro cards play without music.
  - The source can be an uploaded audio file or the audio taken from one of the gameplay clips.
  - Gameplay clip audio is muted by default, with an optional per-scene "keep clip audio" switch mixed over the music. The music ducks under kept clip audio (see step 5).
  - The 1989 splash plays its jingle; the 1985 splash is silent, as in the original footage. Either can use an uploaded sound instead, or none.
- **Output: 25 fps** (PAL-era frame rate), H.264/AAC MP4: 1440×1080 for 4:3, 1920×1080 for 16:9, 1080×1920 for 9:16.
- **Fonts:** a free Helvetica-style sans for captions and packshot text, plus custom-designed chunky logo type for the 1985 splash. Font choices are defined once in the template theme config so they're easy to change.
- **Splash intros are recreated in code**, not taken from the original footage, and follow the originals' timing and motion closely (decided 2026-11-01). The 1985 neon panel is SVG with a CSS 3D flip on the GSAP timeline. The 1989 ident is static in the original, so it's SVG too; three.js isn't needed (changed 2026-11-01). The 1989 jingle is an original synth ident in the same style, synthesised in code. Splash is an optional, selectable intro, and users can upload their own logo (replacing the lettering) and sound.
- **Brand/rights:** UK IPO, TMview, and WIPO Global Brand Database searches on 2026-11-01 found no "Bulletin 1000" trade marks, and Companies House has no matching company. The splash logo artwork will be a **modified reinterpretation** of the originals, not a copy. Brand text and logo assets live in one place in the code so they can be swapped if needed.
- **Aspect ratio:** 4:3 only for the MVP. **Changed 2026-11-02:** a project picks 4:3 (default, and for older projects), 16:9 or 9:16 (`aspectRatio` in the doc, Format in the Details tab). Each format has its own stage size and layout in `theme.ts` (`formats`):
  - **16:9** keeps the 4:3 layout at the same size, centred, with wider black sides, so the game screen stays an original-style 4:3 inset.
  - **9:16** puts the game screen across the middle (1008×756), the caption under it on two lines (title, then publisher), and the packshot's box art above the prices, which go into two columns beyond three pairs.
  - The splashes keep their 1440×1080 artwork, centred (scaled to 75% across the width for 9:16), with their backgrounds filling the stage.
  - 4:3 output is unchanged: frames are byte-identical to before.
  - **Backdrop (2026-11-02):** what fills the stage around the game screen is a project setting, black by default. 'blur' draws the clip's current frame small onto a canvas, CSS-blurred and darkened, in both preview and export (export output stays deterministic).
- **Look: clean output for the MVP.** CRT/VHS filters come in the effects milestone.
- **Effects (decided 2026-11-02):** CSS and SVG filters on the composition stage rather than WebGL shaders. The stage is DOM, which WebGL can't read without re-rendering it, and filters keep preview and export identical with one implementation. Each effect is an amount from 0 to 1 in the doc, with presets as starting points. Everything time-based comes from the frame number, and a video with every effect at 0 is drawn exactly as before.
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
- [x] Check that asset IDs referenced in a project doc belong to that project (`updateProject` rejects others)

### 2. Upload pipeline

- [x] Upload endpoint with size and duration limits (`POST /api/projects/:id/assets?name=…`, raw file body streamed to disk). Limits: clips 100MB / 120s, audio 50MB / 10 min, images 20MB / 4096px
- [x] Probe uploads with ffprobe (duration, dimensions, frame rate, audio streams)
- [x] Transcode gameplay clips to H.264/AAC at a constant 25fps, square pixels, capped at 1440×1080 (smaller clips keep their native size)
- [x] Generate thumbnails for clips and images
- [x] Accept audio file uploads for the music track (transcoded to AAC)
- [x] Serial background processing queue; interrupted jobs resume after a restart
- [x] Serve media by asset ID (`/media/:assetId/file|thumb`) with Range support for seeking
- [x] Decide how to scale low-resolution gameplay into the inset: pixelated by default (see step 3)
- [x] Clean up asset references in the project doc when an asset is deleted (scenes keep a placeholder)

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
- [x] Inset scaling for low-res gameplay: `insetScaling` in the theme defaults to `'pixelated'` (crisp pixel art; decided 2026-11-01). `'smooth'` looks more like the analogue originals. Could become a per-project option later.
- [x] Replace the splash placeholder card (step 6)

### 4. Editor UI

- [x] Project list on the homepage (create, open, delete)
- [x] Editor at `/projects/:id`, saving automatically a moment after each change (only when the doc is valid)
- [x] Game details form (title, publisher, prices/platforms, box art, packshot colour)
- [x] Asset bin with uploads (progress, errors), thumbnails and processing status; add an asset as a scene, box art or music
- [x] Ordered scene list (drag to reorder, including the intro cards)
- [x] Clip trimmer (in/out points in whole frames)
- [x] Caption editor
- [x] Splash picker and music track picker (source, start point, offset, volume)
- [x] Embedded preview
- [x] Fixed: frame 0 rendered blank until the timeline had moved
- [x] Jump the preview to the selected scene (after any dissolve)
- [x] Undo/redo: header buttons and Ctrl+Z / Ctrl+Shift+Z (text fields keep their own undo). Quick edits in one field or slider merge into one step; history holds 100 steps and isn't kept across reloads.

### 5. Export

- [x] SQLite-backed render job queue with a single worker (`renders` table; the doc is copied when a render is requested; unfinished renders resume after a restart)
- [x] Playwright (`playwright-core`) frame capture at 1440×1080, 25 fps, using Google Chrome (`channel: 'chrome'`, or `CHROME_PATH`) rather than Playwright's bundled Chromium, which ships without H.264/AAC decoders
- [x] One ffmpeg pass: PNG frames piped in, music and clip audio mixed, H.264/AAC MP4 out
- [x] Music ducking under clip audio (decided 2026-11-01):
  - project settings in Music & splash: level (default 30% of the music volume) and fade time (default 0.25s)
  - per scene: "Lower the music" switch (on by default) for scenes that keep their clip audio
  - `schedule.ts` produces the duck windows and `musicGain()`; the export renders the same curve as an ffmpeg volume expression (tested against each other)
- [x] Render progress and status in the editor's Export drawer; deleting a render stops it
- [x] Download link and in-page player for the finished MP4 (`/renders/:id/file`)
- [x] Mix in the splash jingle
- [x] Per-scene ducking level: a scene can set its own music level, or follow the project's. Close windows with different levels meet, and the music ramps between them.
- [x] Faster capture: lossless CDP screenshots with `optimizeForSpeed`, and several pages rendering in parallel (`RENDER_PAGES`, default half the cores up to 4). The 58s test video now exports in about 38s (was about 130s). Video frames are copied to a canvas in export, which made parallel capture byte-identical to one page.

### 6. Splash recreations

- [x] 1985 neon panel splash: lettering and "Video Magazine" neon script over a 5×3 neon grid, flipping in 1¼ turns about its horizontal axis. The motion follows keyframes measured from the reference (`theme.ts`, `curve.ts`); the splash lasts 2.4s, as in the original.
- [x] 1989 ident: lit 3D shapes with floor shadows, chrome "Bulletin 1000" lettering with a reflection and "VISUAL COMMUNICATIONS" between rules, on a blue gradient. It fades in over 0.4s and out at 6.36–6.92s (7s), as in the original.
- [x] Built-in 1989 jingle: an original synth ident (D major, ~150 bpm), synthesised deterministically in `src/server/jingle.server.ts`, cached under `DATA_DIR/generated/` and served at `/audio/jingle-1989`
- [x] User options: splash logo image instead of the lettering; splash sound as built-in, none or an uploaded file
- [x] Splash length: hold the splash on its last pose for up to 3s longer (Audio tab slider). The 1989 fade-out moves later; the jingle keeps its own length
- [x] Optional VHS softness on the splash: covered by the effects milestone, whose filters apply to the whole video, splash included

## Later milestones

- [x] ElevenLabs TTS narration
  - [x] server-side API key (`ELEVENLABS_API_KEY`), curated voices (`ELEVENLABS_VOICES`, or every voice on the account), daily character cap and a serial request queue
  - [x] audio cached by a hash of provider, model, voice and text
  - [x] a voice line on any scene, with a start offset; card scenes stretch to fit, lines on gameplay run over the cut
  - [x] narration voice, volume and "lower the music under narration" in the Audio tab; Generate / Generate all; stale lines flagged in the scene list and inspector, and export blocked until they're regenerated
  - [x] preview playback and export mixing
  - [x] Per-line voice and settings: a "Voice settings" section under each line's text (voice, speed, stability, similarity, style; Reset returns to the project voice and the voice's own settings). The settings are part of the cache key and the up-to-date check; clips made before this keep their ids.
  - [x] Pause markers: "Add pause" puts `[pause 0.5s]` at the cursor, and the length can be edited in the text. They become SSML break tags on Multilingual v2, Flash and Turbo, and `[short pause]`, `[pause]` or `[long pause]` on Eleven v3 and later. Each pause is up to 3s, with at most 3 a line, because more break tags make ElevenLabs unstable. The stand-in voice adds the pauses and follows the speed.
  - [x] Checked pause markers and settings against real ElevenLabs voices (2026-11-02): all worked as expected
  - [ ] Operator alert when the ElevenLabs account runs low: check the remaining quota (needs the key's `user_read` permission) and warn in the server log or an admin view. Not shown to users. Per-user credits are under monetisation.
  - [ ] Delete cached voice clips nothing uses (part of the retention question)
- [x] 16:9 and 9:16 layouts
  - [x] `aspectRatio` in the project doc (older docs and render docs default to 4:3); Format picker in the Details tab
  - [x] per-format stage size and layout in `theme.ts`; scenes and splashes built from the format
  - [x] preview player fits tall formats to the window height; export captures at the format's size; the Export drawer shows each render's format
  - [x] "Around the game screen" setting (Details tab): black, like the originals, or a blurred copy of the game filling the frame (`backdrop` in the doc; look tuned in `theme.ts`). Works in every format. Cropping the game to fill was dropped, since it would cut off HUDs.
  - [x] Per-format overlay caption area (`overlayCaption.area` in the layout): over the game screen in 4:3 and 16:9, in the space above it in 9:16
- [x] Filter effects (VHS tape and CRT screen), built from CSS and SVG filters in the composition (not WebGL), so preview and export share one implementation
  - [x] `effects` in the project doc: an amount from 0 to 1 for each of softness, colour bleed, grain, tracking (wobble and head-switching noise), scanlines, curvature and vignette
  - [x] `src/composition/effects.ts`; strengths at full amount and the presets in `theme.ts`
  - [x] Effects tab: presets (Clean, VHS tape, CRT screen, Worn tape on a CRT) and a slider per effect
  - [x] Deterministic: grain, wobble and noise come from the frame number; textures come from a seeded generator. Frames are byte-identical across export pages.
  - [ ] Export with effects is slow: about 4× real time for the heaviest preset on the dev machine, against about 0.65× without effects. The SVG filters run on the CPU in headless Chrome. Options: enable GPU rasterisation for the export browser, or move the costly effects (colour bleed, curvature) to an ffmpeg pass and keep the CSS versions for preview.
  - [ ] Check preview frame rate with effects on a typical machine; if it's choppy, show a simplified look while playing
  - [ ] More effects: dropout lines, tape crease, roll/hum bar, phosphor glow
- [ ] Clerk auth and the My Videos page (list, re-edit, download)
- [ ] Selectable and editable transitions/animations
- [ ] Additional templates (e.g. a WHSmith-style compilation)
- [ ] Homepage with a promo video made by the tool itself
- [ ] Monetisation tiers (free / standard / pro), where limits might include render length, watermark, resolution, and TTS characters
  - [ ] Per-user TTS credits (needs auth):
    - a usage ledger: each generation records the user and the characters it cost (`voice_clips` already stores characters and time)
    - a monthly character allowance from the user's plan, shown in the editor (e.g. "1,240 of 10,000 characters left this month")
    - checked on the server before calling ElevenLabs, replacing the global daily cap as the per-user limit
  - [ ] Decide how cache hits count: the voice clip cache is shared, so a line someone else already generated costs nothing to make again. Charging only for real generations is simplest; regenerations are real requests and cost credits.

## Open questions

- Retention policy for uploaded media and renders on the VPS (deferred)
