import { Button, ColorPicker, Form, Input, Segmented, Select } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { badgeStatuses, stores } from '#/composition/stores'
import { formats } from '#/composition/theme'
import { aspectRatioSchema, storeSchema } from '#/lib/project'
import type {
  AspectRatio,
  Backdrop,
  BadgeStatus,
  PricePlatform,
  ProjectDoc,
} from '#/lib/project'
import type { AssetRow } from '#/server/db/schema'
import { AssetSelect } from './AssetSelect'
import type { UpdateDoc } from './useProjectDoc'

interface Props {
  doc: ProjectDoc
  assets: AssetRow[]
  update: UpdateDoc
}

const MAX_PRICES = 8

const formatHelp: Record<AspectRatio, string> = {
  '4:3': 'Like the originals.',
  '16:9': 'Widescreen, with the 4:3 layout in the middle.',
  '9:16': 'Vertical, for phones and short-video sites.',
}

// The video's format, and the game details shown on the caption and
// packshot.
export function DetailsForm({ doc, assets, update }: Props) {
  const set = (fields: Partial<ProjectDoc>, merge?: string) =>
    update((d) => ({ ...d, ...fields }), { merge })
  const setPrice = (index: number, fields: Partial<PricePlatform>) =>
    update((d) => ({
      ...d,
      prices: d.prices.map((p, i) => (i === index ? { ...p, ...fields } : p)),
    }))

  return (
    <Form layout="vertical">
      <Form.Item
        label="Format"
        extra={`${formatHelp[doc.aspectRatio]} ${formats[doc.aspectRatio].width}×${formats[doc.aspectRatio].height}.`}
      >
        <Segmented<AspectRatio>
          block
          value={doc.aspectRatio}
          options={aspectRatioSchema.options.map((value) => ({
            value,
            label: formats[value].label,
          }))}
          onChange={(aspectRatio) => set({ aspectRatio })}
        />
      </Form.Item>
      <Form.Item
        label="Around the game screen"
        extra={
          doc.backdrop === 'blur'
            ? 'A soft, darkened copy of the game fills the frame.'
            : 'Black, like the originals.'
        }
      >
        <Segmented<Backdrop>
          block
          value={doc.backdrop}
          options={[
            { value: 'black', label: 'Black' },
            { value: 'blur', label: 'Blurred game' },
          ]}
          onChange={(backdrop) => set({ backdrop })}
        />
      </Form.Item>
      <Form.Item label="Game title" htmlFor="game-title">
        <Input
          id="game-title"
          value={doc.title}
          maxLength={100}
          onChange={(e) => set({ title: e.target.value })}
        />
      </Form.Item>
      <Form.Item label="Publisher" htmlFor="game-publisher">
        <Input
          id="game-publisher"
          value={doc.publisher}
          maxLength={100}
          onChange={(e) => set({ publisher: e.target.value })}
        />
      </Form.Item>
      <Form.Item
        label="Prices"
        extra="Shown on the packshot, top to bottom. Use a new line for a second platform line."
      >
        <div className="flex flex-col gap-2">
          {doc.prices.map((p, i) => (
            <div key={i} className="flex items-start gap-2">
              <Input
                className="w-24! shrink-0"
                placeholder="£7.95"
                value={p.price}
                maxLength={30}
                onChange={(e) => setPrice(i, { price: e.target.value })}
              />
              <Input.TextArea
                placeholder="Spectrum"
                autoSize={{ minRows: 1, maxRows: 3 }}
                value={p.platform}
                maxLength={60}
                onChange={(e) => setPrice(i, { platform: e.target.value })}
              />
              <Button
                type="text"
                aria-label="Remove price"
                icon={<DeleteOutlined />}
                onClick={() =>
                  update((d) => ({
                    ...d,
                    prices: d.prices.filter((_, j) => j !== i),
                  }))
                }
              />
            </div>
          ))}
          <Button
            icon={<PlusOutlined />}
            disabled={doc.prices.length >= MAX_PRICES}
            onClick={() =>
              update((d) => ({
                ...d,
                prices: [...d.prices, { price: '', platform: '' }],
              }))
            }
          >
            Add price
          </Button>
        </div>
      </Form.Item>
      <Form.Item label="Box art">
        <AssetSelect
          assets={assets}
          kind="image"
          value={doc.boxArtAssetId}
          placeholder="Upload an image, then choose it here"
          onChange={(boxArtAssetId) => set({ boxArtAssetId })}
        />
      </Form.Item>
      <Form.Item label="Packshot colour">
        <ColorPicker
          disabledAlpha
          showText
          value={doc.packshotColour}
          onChange={(c) =>
            set({ packshotColour: c.toHexString() }, 'packshot-colour')
          }
        />
      </Form.Item>
      <Form.Item
        label="Badge"
        extra="Shown at the bottom of the packshot text, with the store's logo."
      >
        <div className="flex flex-col gap-2">
          <Segmented<BadgeStatus | 'none'>
            block
            value={doc.badge?.status ?? 'none'}
            options={[
              { value: 'none', label: 'None' },
              ...Object.entries(badgeStatuses).map(([value, s]) => ({
                value: value as BadgeStatus,
                label: s.label,
              })),
            ]}
            onChange={(status) =>
              set({
                badge:
                  status === 'none'
                    ? null
                    : { store: doc.badge?.store ?? 'itch', status },
              })
            }
          />
          {doc.badge && (
            <Select
              value={doc.badge.store}
              options={storeSchema.options.map((value) => ({
                value,
                label: stores[value].name,
              }))}
              onChange={(store) =>
                doc.badge && set({ badge: { ...doc.badge, store } })
              }
            />
          )}
        </div>
      </Form.Item>
    </Form>
  )
}
