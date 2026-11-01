bulletin-1000-generator is a web app that lets users generate their own Bulletin 1000 video magazine-style promotional videos for modern homebrew games on retro computer systems.

## Project plan

The plan, decisions and task checklists live in [`docs/project-plan.md`](docs/project-plan.md). Read it before starting work.

- Tick off checklist items as they're completed.
- Add newly discovered tasks.
- Record changed decisions there, with the date.

The visual and structural reference for the video template (promo structure, splash, packshot and caption styles) is in [`docs/style-guide.md`](docs/style-guide.md). Read it before working on the composition.

## Tech stack

- TanStack Start / Router (on Nitro, built with Vite)
- TypeScript
- Ant Design (components) + Tailwind
- GSAP (video composition)
- SQLite
- Clerk auth (later milestone)

## Commands

- `npm run dev`: dev server on port 3000
- `npm run build`: production build
- `npm run lint` / `npm run format` / `npm run check`

Imports can use the `#/*` alias for `src/*`.

## Technical rules

- **Deterministic composition.** The same GSAP composition is used for the in-browser preview and for the server export, where headless Chromium steps through the timeline frame by frame. Never use `Date.now()`, real-time timers or other wall-clock-dependent animation. All timing must come from the timeline.
- **Theme in one place.** Fonts, colours, and Bulletin 1000 brand text and logos are defined once in the template theme config, so they can be changed or swapped easily.
- **Media on disk.** Uploads and renders are stored under the configurable media directory, never in the repo.
- **Server tools.** ffmpeg/ffprobe and Chromium (Playwright) are expected to be installed on the host.
- **Reference footage.** Original promo clips are in `reference/`, which is gitignored. The splash intros are recreated in code as reinterpretations; never embed or copy the original footage or jingle.
