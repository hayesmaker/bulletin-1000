import { Button, ColorPicker, Form, Input } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import type { PricePlatform, ProjectDoc } from '#/lib/project'
import type { AssetRow } from '#/server/db/schema'
import { AssetSelect } from './AssetSelect'
import type { UpdateDoc } from './useProjectDoc'

interface Props {
  doc: ProjectDoc
  assets: AssetRow[]
  update: UpdateDoc
}

const MAX_PRICES = 8

// Game details shown on the caption and packshot.
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
    </Form>
  )
}
