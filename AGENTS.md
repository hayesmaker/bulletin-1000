bulletin-1000-generator is a web app that lets users generate their own Bulletin 1000 video magazine-style promotional videos for modern homebrew games on retro computer systems.

## Project plan

The plan, decisions and task checklists live in [`docs/project-plan.md`](docs/project-plan.md). Read it before starting work.

- Tick off checklist items as they're completed.
- Add newly discovered tasks.
- Record changed decisions there, with the date.

The visual and structural reference for the video template (promo structure, splash, packshot and caption styles) is in [`docs/style-guide.md`](docs/style-guide.md). Read it before working on the composition.

## Git rules

- As an llm agent you will never push or offer to push code to master.
- All code will be reviewed by me, the author. You can Push PRs for me to review.
- Open every PR against `master`, never against another feature branch. Stacked PRs merged in quick succession end up in the old feature branch instead of `master` (this happened with #10 and #12). Branch from `master` once the previous PR is merged. If work has to start before then, branch from the unmerged feature branch but still target `master`, and say in the PR that its diff includes the earlier PR's commits until that one lands.

## Tech stack

- TanStack Start / Router (on Nitro, built with Vite)
- TypeScript
- Ant Design (components) + Tailwind
- GSAP (video composition)
- SQLite via Drizzle ORM + better-sqlite3
- Zod (project document and server function validation)
- Vitest
- Clerk auth (later milestone)

## Commands

- `npm run dev`: dev server on port 3000
- `npm run build`: production build
- `npm run lint` / `npm run format` / `npm run check`
- `npm test`: run the Vitest suite
- `npm run db:generate`: generate a migration in `drizzle/` after changing `src/server/db/schema.ts` (migrations are applied automatically when the server opens the database)
- `npm run db:studio`: browse the database
- `npm run seed:demo`: create a demo project to preview (`-- --box art.png --clip a.mp4 --clip b.mp4 --music tune.mp3 --splash 1989`; anything not given is generated with ffmpeg)

Imports can use the `#/*` alias for `src/*`.

## Code layout

- `src/lib/`: code shared by client and server. `project.ts` holds the project document schema (Zod) and its types.
- `src/server/`: server code. `*.server.ts` files are server-only (Start import protection). `*.functions.ts` files hold `createServerFn` wrappers and are safe to import from routes.
- `src/server/db/`: Drizzle schema and the database client.
- `src/server/assets.server.ts`: upload handling and the background processing queue. `ffmpeg.server.ts` wraps ffmpeg/ffprobe.
- `src/routes/api/`: raw HTTP server routes (file uploads).
- `src/server/media.handler.ts`: serves `/media/:assetId/(file|thumb)`. It's a **Nitro handler registered in `vite.config.ts`**, not a TanStack route. Nitro's dev server treats browser media requests (`Sec-Fetch-Dest: image/video/audio`, or URLs ending in a file extension) as static files and only passes them to Nitro-level handlers. Anything loaded by `<img>`, `<video>` or `<audio>` must be served this way.
- `src/composition/`: the video template. `theme.ts` (all fonts, colours and timings, plus `formats`: the stage size and layout for each aspect ratio), `schedule.ts` (pure timing: project doc → scene and audio times, in whole frames), `scenes.ts` (DOM per scene type), `effects.ts` (VHS/CRT filter effects over the whole stage: CSS and SVG filters, with frame-number-driven grain and noise), `splash.ts` (the 1985 and 1989 splash intros, SVG; motion keyframes in `theme.ts`, interpolated by `curve.ts`) and `composition.ts` (GSAP timeline, preview media sync, `renderFrame` for export).
- `src/server/jingle.server.ts`: synthesises the built-in 1989 jingle (deterministic; cached in `DATA_DIR/generated/`, served by `jingle.handler.ts` at `/audio/jingle-1989`). Bump `JINGLE_VERSION` when changing the sound.
- `src/routes/index.tsx`: project list. `src/routes/projects/$projectId/index.tsx`: the editor, built from `src/components/editor/` (details form, asset bin, scene list, scene inspector with the clip trimmer and caption editor). `useProjectDoc` autosaves the doc and keeps its undo/redo history (`history.ts`: quick edits in one field or slider merge into one step; deleting an asset rewrites the whole history so undo can't bring it back); pure doc edits (`newScene`, `moveScene`, `removeScene`, `removeAssetReferences`) live in `src/lib/project.ts`.
- `src/routes/projects/$projectId/preview.tsx`: full-page preview player. `src/routes/render/$projectId.tsx`: bare 1440×1080 stage for the exporter, exposing `window.composition` once ready.
- `drizzle/`: generated SQL migrations. Commit them; don't edit them by hand.
- `src/server/renders.server.ts`: video export. A serial queue renders each job by loading `/render/:projectId?render=<id>` in headless Chrome (`capture.server.ts`), stepping `renderFrame`, and piping PNGs into one ffmpeg process that also mixes the audio (`mix.server.ts`). `render-file.handler.ts` (a Nitro handler, like media) serves `/renders/:renderId/file`.
- Narration: `src/server/tts.server.ts` (ElevenLabs client, stand-in provider, `voice_clips` cache, daily limit), `narration.functions.ts` (status, voices, generate), `voice.handler.ts` (`/voice/:clipId`). In the editor, `useNarration` plus `NarrationPanel` (Audio tab) and `VoiceLineEditor` (scene inspector). Voice lines live on scenes (`voiceLine`, with the generated `clip`); `voiceLineStatus()` in `src/lib/project.ts` says whether a line is up to date, and only up-to-date lines reach the schedule.
- `DATA_DIR` (default `./data`, gitignored) holds `bulletin.db` and `media/<projectId>/<assetId>/`; renders go to `media/<projectId>/renders/<renderId>.mp4`, generated narration to `voice/<clipId>.mp3` and the built-in jingle to `generated/`.

## Technical rules

- **Deterministic composition.** The same GSAP composition is used for the in-browser preview and for the server export, where headless Chromium steps through the timeline frame by frame. Never use `Date.now()`, real-time timers or other wall-clock-dependent animation. All timing must come from the timeline.
- **Theme in one place.** Fonts, colours, and Bulletin 1000 brand text and logos are defined once in the template theme config, so they can be changed or swapped easily.
- **Media on disk.** Uploads and renders are stored under the configurable media directory, never in the repo.
- **Server tools.** ffmpeg/ffprobe and Google Chrome are expected to be installed on the host. Export uses `playwright-core` with Chrome, not Playwright's bundled Chromium (no H.264/AAC). Set `CHROME_PATH` to use a specific executable. Export renders with several Chrome pages in parallel (frames dealt out in turn, written in order); `RENDER_PAGES` sets how many (default: half the CPU cores, up to 4). In export, `renderFrame` copies each video frame onto a canvas, because a screenshot straight after a video seek can show the previous frame.
- **Render base URL.** The export browser loads the render page from this server, at the origin of the request that started the render. Set `RENDER_BASE_URL` (e.g. `http://localhost:3000`) when that origin isn't reachable from the server itself, such as behind a proxy.
- **Preview and export audio must match.** Music volume (fade-out, ducking) comes from `musicGain()` in `schedule.ts`; `musicGainExpression()` in `mix.server.ts` is its ffmpeg twin. Change both together; `mix.server.test.ts` checks they agree.
- **Narration keys stay on the server.** `src/server/tts.server.ts` is the only place that reads `ELEVENLABS_API_KEY`; the browser goes through `narration.functions.ts`. Never send the key, or ElevenLabs responses with account details, to the client. Generation happens only when the user asks for it. Tests use the stand-in provider (`TTS_FAKE=1`) or a mocked `fetch`, never the real API.
- **Reference footage.** Original promo clips are in `reference/`, which is gitignored. The splash intros are recreated in code as reinterpretations; never embed or copy the original footage or jingle.
