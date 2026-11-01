import type { ProjectDoc, Scene } from '#/lib/project'
import type { AssetInfo, ScheduledItem } from './schedule'
import { buildSplash } from './splash'
import type { SplashLayer } from './splash'
import { colours, insetScaling, layout, stage } from './theme'

// DOM builders for each scene type. Each returns an absolutely positioned
// layer covering the stage; the composition shows and hides layers and
// captions on the timeline.

export interface CompositionAsset extends AssetInfo {
  url: string
}

export interface CaptionCue {
  el: HTMLElement
  start: number
  end: number
}

export interface VideoCue {
  el: HTMLVideoElement
  // Item start on the timeline and the in point within the clip.
  start: number
  end: number
  trimIn: number
  keepClipAudio: boolean
}

export interface BuiltLayer {
  layer: HTMLElement
  captions: CaptionCue[]
  video?: VideoCue
  images: HTMLImageElement[]
  // Motion of its own, added to the timeline at the item's start.
  animate?: SplashLayer['animate']
}

type Style = Partial<CSSStyleDeclaration>

function el<TTag extends keyof HTMLElementTagNameMap>(
  tag: TTag,
  style: Style,
  ...children: Array<Node | string>
) {
  const node = document.createElement(tag)
  Object.assign(node.style, style)
  node.append(...children)
  return node
}

const rect = (r: { x: number; y: number; width: number; height: number }) => ({
  position: 'absolute',
  left: `${r.x}px`,
  top: `${r.y}px`,
  width: `${r.width}px`,
  height: `${r.height}px`,
})

const fill: Style = {
  position: 'absolute',
  inset: '0',
  visibility: 'hidden',
  opacity: '0',
  overflow: 'hidden',
}

const textShadow = `0 3px 6px ${colours.textShadow}`

function placeholder(r: Style, label: string) {
  return el(
    'div',
    {
      ...r,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      background: colours.placeholder,
      color: colours.placeholderText,
      fontSize: '48px',
      fontWeight: '600',
    },
    label,
  )
}

function image(
  asset: CompositionAsset,
  style: Style,
  images: HTMLImageElement[],
) {
  const img = el('img', { ...style, objectFit: 'contain', display: 'block' })
  img.src = asset.url
  img.alt = ''
  images.push(img)
  return img
}

const scaling: Style = {
  imageRendering: insetScaling === 'pixelated' ? 'pixelated' : 'auto',
}

function gameCaption(doc: ProjectDoc) {
  const { caption } = layout
  const title = doc.title.toUpperCase()
  const text = doc.publisher ? `${title} – ${doc.publisher}` : title
  return el(
    'div',
    {
      position: 'absolute',
      left: '0',
      right: '0',
      top: `${caption.y}px`,
      transform: 'translateY(-50%)',
      textAlign: 'center',
      color: colours.text,
      fontSize: `${caption.fontSize}px`,
      fontWeight: String(caption.fontWeight),
      fontStretch: caption.fontStretch,
      letterSpacing: caption.letterSpacing,
      whiteSpace: 'nowrap',
      textShadow,
    },
    text,
  )
}

function overlayCaptions(
  item: ScheduledItem,
  captions: Array<{ text: string; start: number; end: number }>,
) {
  const { inset, overlayCaption: o } = layout
  return captions.map((c) => {
    const node = el(
      'div',
      {
        ...rect(inset),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        visibility: 'hidden',
        opacity: '0',
      },
      el(
        'div',
        {
          maxWidth: `${o.maxWidth}px`,
          textAlign: 'center',
          color: colours.text,
          fontSize: `${o.fontSize}px`,
          fontWeight: String(o.fontWeight),
          fontStretch: o.fontStretch,
          lineHeight: '1.1',
          textTransform: 'uppercase',
          whiteSpace: 'pre-line',
          textShadow: `0 0 4px ${colours.background}, ${textShadow}`,
        },
        c.text,
      ),
    )
    return {
      el: node,
      start: item.start + c.start,
      end: Math.min(item.start + c.end, item.end),
    }
  })
}

export function buildLayer(
  item: ScheduledItem,
  doc: ProjectDoc,
  assets: Map<string, CompositionAsset>,
): BuiltLayer {
  const layer = el('div', { ...fill, background: colours.background })
  layer.dataset.item = item.id
  const built: BuiltLayer = { layer, captions: [], images: [] }

  if (item.kind === 'splash') {
    const logo = doc.splashLogoAssetId
      ? assets.get(doc.splashLogoAssetId)
      : undefined
    const splash = buildSplash(item.splash, logo)
    layer.append(splash.el)
    built.images.push(...splash.images)
    built.animate = splash.animate
    return built
  }

  const scene: Scene = item.scene
  const asset =
    'assetId' in scene && scene.assetId ? assets.get(scene.assetId) : undefined

  switch (scene.type) {
    case 'packshot':
      layer.style.background = doc.packshotColour
      layer.append(...packshot(doc, assets, built.images))
      break

    case 'publisher-logo': {
      const { maxWidth, maxHeight, fontSize } = layout.publisherLogo
      const box: Style = {
        ...rect({
          x: (stage.width - maxWidth) / 2,
          y: (stage.height - maxHeight) / 2,
          width: maxWidth,
          height: maxHeight,
        }),
      }
      if (asset) layer.append(image(asset, box, built.images))
      else if (doc.publisher) {
        layer.append(
          el(
            'div',
            {
              ...box,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: colours.text,
              fontSize: `${fontSize}px`,
              fontWeight: '800',
              textAlign: 'center',
            },
            doc.publisher,
          ),
        )
      }
      break
    }

    case 'title-screen':
      layer.append(
        asset
          ? image(asset, { ...rect(layout.inset), ...scaling }, built.images)
          : placeholder(rect(layout.inset), 'Title screen'),
      )
      break

    case 'screenshot':
      layer.append(
        asset
          ? image(asset, { ...rect(layout.inset), ...scaling }, built.images)
          : placeholder(rect(layout.inset), 'Screenshot'),
        gameCaption(doc),
      )
      built.captions = overlayCaptions(item, scene.captions)
      break

    case 'gameplay':
      if (asset) {
        const video = el('video', {
          ...rect(layout.inset),
          ...scaling,
          objectFit: 'contain',
          background: colours.background,
        })
        video.src = asset.url
        video.muted = true
        video.playsInline = true
        video.preload = 'auto'
        layer.append(video)
        built.video = {
          el: video,
          start: item.start,
          end: item.end,
          trimIn: scene.trimIn,
          keepClipAudio: scene.keepClipAudio,
        }
      } else {
        layer.append(placeholder(rect(layout.inset), 'Gameplay clip'))
      }
      layer.append(gameCaption(doc))
      built.captions = overlayCaptions(item, scene.captions)
      break
  }
  layer.append(...built.captions.map((c) => c.el))
  return built
}

function packshot(
  doc: ProjectDoc,
  assets: Map<string, CompositionAsset>,
  images: HTMLImageElement[],
) {
  const p = layout.packshot
  const boxArt = doc.boxArtAssetId ? assets.get(doc.boxArtAssetId) : undefined
  const box = boxArt
    ? image(boxArt, { ...rect(p.boxArt), objectPosition: 'center' }, images)
    : placeholder(rect(p.boxArt), 'Box art')

  const text: Style = { color: colours.text, textShadow, lineHeight: '1.08' }
  const column = el('div', {
    ...rect(p.prices),
    display: 'flex',
    flexDirection: 'column',
    justifyContent: doc.prices.length > 1 ? 'space-between' : 'flex-start',
  })
  if (doc.prices.length === 0) {
    column.append(
      el(
        'div',
        {
          ...text,
          fontSize: `${p.titleFontSize}px`,
          fontWeight: String(p.priceFontWeight),
          textTransform: 'uppercase',
        },
        doc.title,
      ),
    )
  }
  for (const { price, platform } of doc.prices) {
    column.append(
      el(
        'div',
        {},
        el(
          'div',
          {
            ...text,
            fontSize: `${p.priceFontSize}px`,
            fontWeight: String(p.priceFontWeight),
          },
          price,
        ),
        el(
          'div',
          {
            ...text,
            fontSize: `${p.platformFontSize}px`,
            fontWeight: String(p.platformFontWeight),
            whiteSpace: 'pre-line',
          },
          platform,
        ),
      ),
    )
  }
  return [box, column]
}
