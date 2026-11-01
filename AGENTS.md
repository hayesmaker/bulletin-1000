bulletin-1000-generator is a project to create an online web application designed to allow users to generate their own bulletin 1000 video magazine promotional videos for modern homebrew games for retro computer systems.

tech stack:

- tanstack
- ant design component library
- sql lite db
- nitro
- typescript
- tailwind
- gsap
- vite
- clerk auth

Main site map:

- Homepage including a prompotional video for the tool itself designed by me using the generator
- The Editor - the main user input side where the user can add assets, enter scripts and generator their videos
- My Videos page - where the user can see their created content and download their videos

User Inputs:

- Game Assets - the user can upload their own game cover art, screenshots and gameplay videos - they core of the generated video output
- Scripts - the user can enter scripts for the bulletin 1000 presenter to read out during the video (ElevanLabs integration for tts)
- Animations the user can choose from predefined transition and effects for asset transitions. And can edit these later.
- Effects - the user can choose from various filter effects for the output vide - (eg vhs grain, crt filter)
- Output format: Select 4:3, 16:9 or 9:16 for output video aspect ratio.

Generated videos should be downloadable / editable later.

Monetisation:

- Various monetisation plans: free, standard, pro. etc. To be decided later.

---

## Decisions (updated 2026-11-01)

- **Rendering: hybrid.** Live preview in the browser (a GSAP timeline driving a canvas/DOM composition). Final export on the server via **headless Chromium replay**: Playwright loads the same composition, steps the GSAP timeline frame by frame, and pipes the frames to ffmpeg, which muxes in the audio. One composition codebase serves both preview and export, so they must stay deterministic (no `Date.now()` or real-time-dependent animation; all timing comes from the timeline).
- **Hosting: self-hosted VPS.** SQLite on local disk. Uploaded assets and rendered videos go on local disk under a configurable media directory. ffmpeg and Chromium are installed on the box.
- **Video format: short promo (30–90s), one game per video**, following the structure of the original Bulletin 1000 promos (see the style guide below).
- **Captions first, narration later.** Like the originals, the MVP relies on on-screen captions and game audio. ElevenLabs TTS (voiceover only, no on-screen presenter) moves to a later milestone.
- **Scene timing:** a gameplay scene lasts as long as its trimmed clip. Card scenes (packshot, title, still screenshot) have a duration the user sets, with sensible defaults.
- **Audio (MVP):** one **continuous music track** (usually the game's own music) runs continuously once it starts and does not restart per scene. Its **start point is the user's choice** and defaults to the start of the first gameplay scene, as in the originals, where the intro cards before it play without music. It can be an uploaded audio file or the audio taken from one of the gameplay clips. Gameplay clip audio is muted by default, with an optional per-scene "keep clip audio" switch mixed over the music. The splash jingle plays when a splash is selected.
- **Output: 1440×1080 at 25fps** (4:3, PAL-era frame rate). H.264/AAC MP4.
- **Fonts:** a free Helvetica-style sans for captions and packshot text, plus custom-designed chunky logo type for the 1985 splash. Font choices are defined once in the template theme config so they are easy to change.
- **Splash intros are recreated in code**, not taken from the original footage: the 1985 neon grid uses GSAP/canvas, and the 1989 3D shapes use three.js. The jingle is a sound-alike. Splash is an optional, selectable intro.
- **Brand/rights:** UK IPO, TMview and WIPO Global Brand Database searches on 2026-11-01 found no "Bulletin 1000" trade marks, and Companies House has no matching company. The splash logo artwork will be a **modified reinterpretation** of the originals, not a copy. Keep brand text and logo assets in one place in the code so they can be swapped if needed.
- **Aspect ratio: 4:3 only for the MVP.** 16:9 and 9:16 layouts come later.
- **Look: clean output for the MVP.** CRT/VHS filters come in the effects milestone.
- **Uploads:** gameplay clips are limited (around 100MB or 2 min). Users set in/out points in the editor, and the server transcodes clips to a standard format (H.264/AAC MP4, constant frame rate) with ffmpeg on upload.

## Reference style guide

Reference clips live in `reference/` (gitignored, not committed). They are 1280×720 captures of 4:3 VHS footage, mostly 30fps.

| File | What it shows |
| --- | --- |
| `bulletin1000-gyroscope-1985.mp4` | **1985 splash** (≈3s) followed by a full promo |
| `bulletin-1000-issue43-aug1989_part16.mp4` | **1989 splash + jingle** (7s, 25fps) |
| `bulletin1000-{ace,arcofyesod}-1985.mp4` | 1985-era promos |
| `bulletin1000-{bigleagesoccer,flintstones,mariobros}-1987.mp4` | 1987-era promos |
| `whsmiths-promo-taitohits-oct88.mp4` | A different format: box art zooming on a yellow-to-black gradient (candidate for a later "compilation" template) |

**Promo structure:**
1. **Splash (optional)**
   - **1985:** the "BULLETIN 1000 / Video Magazine" logo in yellow/orange chunky type over a cyan neon wireframe grid in perspective, on black.
   - **1989:** a 3D blue triangle, green disc and yellow square above chrome "Bulletin 1000" text with "VISUAL COMMUNICATIONS" underneath, on a blue vertical gradient. It plays with a jingle and fades to black.
2. **Publisher logo card (optional)**, e.g. Ocean or Thor.
3. **Packshot card:** a solid colour background (royal blue in 1985; green, olive or a tiled pattern in 1987). Box art sits on the left, with the title and **price/platform pairs** on the right (e.g. "£7.95 Spectrum", "£8.95 C64/BBC B Amstrad") in yellow/white sans type. There's often a thin yellow horizontal rule.
4. **Title screen card (optional).**
5. **Gameplay:** the game music cuts in with the first gameplay clip (and the narration would too, in narrated promos).
   The game screen is a 4:3 inset on black, with a white sans caption underneath reading **"GAME TITLE – Publisher"**. Optional overlay captions call out selling points ("DANGEROUS CHALLENGE", "SUPERB GRAPHICS", "FRENZIED FUN WITH FRED FLINTSTONE").
6. **Packshot card again** as the outro, sometimes cutting to a solid colour at the very end.

Cuts are mostly hard cuts or short dissolves.

## MVP (Milestone 1): single fixed template, 4:3

Goal: upload assets, fill in game details, arrange scenes, and get one Bulletin-1000-style 4:3 MP4 out. **No auth, no payments, no TTS, no My Videos page.**

1. **Project model**: a "project" is a JSON document stored in SQLite, so videos are re-editable later. It holds:
   - game title and publisher
   - price/platform pairs
   - box art
   - packshot colour
   - splash choice (none / 1985 / 1989)
   - music track (uploaded file or a source clip, with a start offset)
   - an ordered scene list, where each scene has a type, an asset, trim points or a duration, and overlay captions
2. **Upload pipeline**: cover art, screenshots and gameplay clips go to disk. ffmpeg transcodes and probes them (duration, dimensions) and generates thumbnails.
3. **Editor UI** (Ant Design): a game details form, an asset bin, an ordered scene list, a clip trimmer, a caption editor and a splash picker.
4. **Composition**: the template built with GSAP (splash → optional publisher logo → packshot → optional title card → gameplay scenes → packshot outro; the user can reorder the intro cards). The preview plays in the editor.
5. **Splash recreations**: 1985 neon grid (GSAP/canvas) and 1989 3D shapes (three.js), plus a sound-alike jingle.
6. **Export**: a render job (SQLite-backed queue, one worker) runs Playwright, captures frames and passes them to ffmpeg, which mixes in the clip audio and jingle. The resulting MP4 goes on disk with a download link.

## Later milestones

- ElevenLabs TTS narration (server-side key, curated voices, rate limiting, audio cached by hash of text and voice). Each scene can have an optional voice line that extends the scene's length. By default narration starts together with the music at the first gameplay scene, but this is user-selectable.
- 16:9 and 9:16 layouts
- Filter effects (CRT, VHS grain, scanlines, colour bleed), most likely as WebGL shaders so preview and export match
- Clerk auth and the My Videos page (list, re-edit, download)
- Selectable and editable transitions/animations
- Additional templates (e.g. a WHSmith-style compilation)
- Homepage with a promo video made by the tool itself
- Monetisation tiers (free / standard / pro), where limits might include render length, watermark, resolution and TTS characters

## Open questions

- Retention policy for uploaded media and renders on the VPS (deferred)
