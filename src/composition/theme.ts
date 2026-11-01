// The Bulletin 1000 template theme: every font, colour, brand string, layout
// measurement and timing the composition uses. Change the look here.
//
// Layout is in stage pixels (1440×1080). Measurements come from the 1985
// reference promos (see docs/style-guide.md). Font files are loaded in
// composition.css; keep `fonts` in sync with it.

export const stage = {
  width: 1440,
  height: 1080,
  fps: 25,
}

export const brand = {
  name: 'Bulletin 1000',
  tagline: 'Video Magazine',
}

export const fonts = {
  sans: "'Archivo Variable', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  // Placeholder until the custom chunky logo type (splash milestone).
  logo: "'Archivo Variable', 'Helvetica Neue', Helvetica, Arial, sans-serif",
}

export const colours = {
  background: '#000000',
  text: '#ffffff',
  textShadow: 'rgba(0, 0, 0, 0.6)',
  logo: '#ffc61a',
  placeholder: '#1a1a1a',
  placeholderText: '#6b6b6b',
}

// How gameplay and stills are scaled into the inset. 'smooth' looks like the
// analogue originals; 'pixelated' keeps low-res pixel art crisp.
export const insetScaling: 'smooth' | 'pixelated' = 'pixelated'

export const layout = {
  // The 4:3 game screen inset, used by gameplay, screenshot and title scenes.
  inset: { x: 180, y: 112, width: 1080, height: 810 },
  // "TITLE – Publisher" under the inset; y is the text's vertical centre.
  caption: {
    y: 1000,
    fontSize: 60,
    fontWeight: 600,
    fontStretch: '80%',
    letterSpacing: '0.01em',
  },
  // Selling-point captions over the gameplay, centred in the inset.
  overlayCaption: {
    fontSize: 64,
    fontWeight: 700,
    fontStretch: '85%',
    maxWidth: 900,
  },
  packshot: {
    boxArt: { x: 135, y: 170, width: 450, height: 795 },
    // Price/platform column; the first pair aligns with the top of the box
    // art and the last with its bottom.
    prices: { x: 652, y: 170, width: 650, height: 795 },
    priceFontSize: 84,
    priceFontWeight: 800,
    platformFontSize: 62,
    platformFontWeight: 500,
    titleFontSize: 84,
  },
  publisherLogo: { maxWidth: 1000, maxHeight: 700, fontSize: 120 },
}

export const timing = {
  // Length of a dissolve into a scene (capped at half of either scene).
  dissolve: 0.5,
  // Music fades out over the last part of the video.
  musicFadeOut: 1.5,
  // Placeholder splash lengths until the splash recreations land.
  splash: { '1985': 3, '1989': 7 },
}
