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
- `src/composition/`: the video template. `theme.ts` (all fonts, colours, layout and timings), `schedule.ts` (pure timing: project doc → scene and audio times, in whole frames), `scenes.ts` (DOM per scene type) and `composition.ts` (GSAP timeline, preview media sync, `renderFrame` for export).
- `src/routes/projects/$projectId/preview.tsx`: preview player. `src/routes/render/$projectId.tsx`: bare 1440×1080 stage for the exporter, exposing `window.composition` once ready.
- `drizzle/`: generated SQL migrations. Commit them; don't edit them by hand.
- `DATA_DIR` (default `./data`, gitignored) holds `bulletin.db` and `media/<projectId>/<assetId>/`.

## Technical rules

- **Deterministic composition.** The same GSAP composition is used for the in-browser preview and for the server export, where headless Chromium steps through the timeline frame by frame. Never use `Date.now()`, real-time timers or other wall-clock-dependent animation. All timing must come from the timeline.
- **Theme in one place.** Fonts, colours, and Bulletin 1000 brand text and logos are defined once in the template theme config, so they can be changed or swapped easily.
- **Media on disk.** Uploads and renders are stored under the configurable media directory, never in the repo.
- **Server tools.** ffmpeg/ffprobe and Chromium (Playwright) are expected to be installed on the host.
- **Reference footage.** Original promo clips are in `reference/`, which is gitignored. The splash intros are recreated in code as reinterpretations; never embed or copy the original footage or jingle.
