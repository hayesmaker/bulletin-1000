# Bulletin 1000 Style Guide

This is the visual and structural reference for the generated promos, based on the original Bulletin 1000 footage. Related decisions (fonts, output format, splash recreation) are in [project-plan.md](project-plan.md#decisions).

Reference clips live in `reference/` (gitignored, not committed). They are 1280×720 captures of 4:3 VHS footage, mostly 30fps.

| File                                                           | What it shows                                                                                                    |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `bulletin1000-gyroscope-1985.mp4`                              | **1985 splash** (about 3s) followed by a full promo                                                              |
| `bulletin-1000-issue43-aug1989_part16.mp4`                     | **1989 splash and jingle** (7s, 25fps)                                                                           |
| `bulletin1000-{ace,arcofyesod}-1985.mp4`                       | 1985-era promos                                                                                                  |
| `bulletin1000-{bigleagesoccer,flintstones,mariobros}-1987.mp4` | 1987-era promos                                                                                                  |
| `whsmiths-promo-taitohits-oct88.mp4`                           | A different format: box art zooming on a yellow-to-black gradient (candidate for a later "compilation" template) |

**Promo structure:**

1. **Splash (optional)**
   - **1985:** the "BULLETIN 1000 / Video Magazine" logo in yellow/orange chunky type over a cyan neon wireframe grid, on black. Silent. Measured from `bulletin1000-gyroscope-1985.mp4`: the panel appears edge-on at about 0.07s and turns 1¼ times about its horizontal axis, top edge coming towards the viewer. It's face-on at 0.5s, edge-on at 0.8s, shows its back (upside down) at 1.07s, is edge-on again at 1.35s and settles face-on at about 1.9s. Meanwhile it grows from about half size to full size. It holds until the cut at about 2.4s.
   - **1989:** a 3D blue triangle, green disc and yellow square above chrome "Bulletin 1000" text with "VISUAL COMMUNICATIONS" underneath, on a blue vertical gradient. Nothing moves. It fades in from black over the first 0.4s and out to black at 6.36–6.92s, with a 7s jingle: synth-pop in D major at about 150 bpm, with a plucked arpeggio, a bell-like lead, bass, two big drum hits (about 4.1s and 5.3s) and a final chord that rings out.
2. **Publisher logo card (optional)**, e.g. Ocean or Thor.
3. **Packshot card:** a solid colour background (royal blue in 1985; green, olive or a tiled pattern in 1987). Box art sits on the left, with the title and **price/platform pairs** on the right (e.g. "£7.95 Spectrum", "£8.95 C64/BBC B Amstrad") in yellow/white sans type. There's often a thin yellow horizontal rule.
4. **Title screen card (optional).**
5. **Gameplay:** the game music cuts in with the first gameplay clip (and so would the narration, in narrated promos). The game screen is a 4:3 inset on black, with a white sans caption underneath reading **"GAME TITLE – Publisher"**. Optional overlay captions call out selling points ("DANGEROUS CHALLENGE", "SUPERB GRAPHICS", "FRENZIED FUN WITH FRED FLINTSTONE").
6. **Packshot card again** as the outro, sometimes cutting to a solid colour at the very end.

Cuts are mostly hard cuts or short dissolves.
