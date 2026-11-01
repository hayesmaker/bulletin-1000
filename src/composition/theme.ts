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
  // Under the 1989 splash lettering.
  tagline1989: 'Visual Communications',
}

export const fonts = {
  sans: "'Archivo Variable', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  // 1985 splash: chunky condensed lettering and a neon script.
  logo: "'Archivo Variable', 'Helvetica Neue', Helvetica, Arial, sans-serif",
  script: "'Yellowtail', cursive",
  // 1989 splash: heavy rounded chrome lettering.
  chrome: "'Rubik Variable', 'Arial Rounded MT Bold', sans-serif",
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
  // Splash lengths, measured from the reference footage.
  splash: { '1985': 2.4, '1989': 7 },
  // Length of the built-in 1989 jingle (src/server/jingle.server.ts).
  builtInJingle: 7,
}

// The splash intros, recreated from the reference footage (see
// docs/style-guide.md). Positions are in stage pixels at rest; times are
// seconds from the splash start.
export const splash = {
  '1985': {
    background: '#040606',
    // A panel carrying the logo over a 5×3 neon grid. It turns 1¼ times
    // about its horizontal axis while flying in, then holds face-on.
    perspective: 1600,
    // Rotation (degrees about X) and scale keyframes: [time, value].
    // Negative turns the top edge towards the viewer, as in the original.
    rotation: [
      [0.04, 90],
      [0.5, 0],
      [0.79, -90],
      [1.07, -180],
      [1.35, -270],
      [1.9, -360],
    ],
    scale: [
      [0.04, 0.5],
      [0.2, 0.56],
      [0.5, 0.67],
      [0.9, 0.83],
      [1.5, 0.92],
      [1.7, 0.975],
      [1.9, 1],
    ],
    grid: {
      x: 255,
      y: 420,
      columns: 5,
      rows: 3,
      cellWidth: 177,
      cellHeight: 160,
      pitchX: 195,
      pitchY: 178,
      radius: 12,
      stroke: 7,
      colour: '#33a4ec',
      glow: '#1f7fd6',
    },
    lettering: {
      x: 248,
      baseline: 405,
      width: 997,
      fontSize: 372,
      fontWeight: 900,
      fontStretch: '62%',
      top: '#ffe03a',
      bottom: '#e8a90c',
      outline: '#b56a00',
      glow: '#ff9a00',
    },
    script: {
      // Centre, length and angle of the "Video Magazine" line.
      x: 880,
      y: 392,
      width: 820,
      angle: -13.4,
      fontSize: 150,
      core: '#ffc890',
      colour: '#ff6a1f',
      glow: '#ff3a00',
    },
    // Where an uploaded logo goes instead of the lettering.
    logoBox: { x: 230, y: 110, width: 1080, height: 400 },
  },
  '1989': {
    fadeIn: [0.04, 0.44],
    fadeOut: [6.36, 6.92],
    background: [
      [0, '#7894bd'],
      [0.35, '#3d5d8a'],
      [0.6, '#2b466c'],
      [1, '#162a47'],
    ],
    shadow: 'rgba(16, 30, 52, 0.55)',
    // Each shape's top face is lit from the upper left.
    triangle: { light: '#3592dc', top: '#0a5fa8', side: '#16416e' },
    disc: { light: '#4fdc52', top: '#06960f', side: '#036f09' },
    square: { light: '#e6cf2c', top: '#b29c08', side: '#7d7203' },
    // A faint mirror image of the lettering below it.
    reflectionOpacity: 0.16,
    lettering: {
      // Centre of the "Bulletin 1000" line.
      x: 682,
      baseline: 822,
      width: 1050,
      fontSize: 168,
      fontWeight: 800,
      tagline: { baseline: 893, fontSize: 44, gap: 24, rule: 2.5 },
    },
    logoBox: { x: 150, y: 650, width: 1080, height: 280 },
  },
} as const
