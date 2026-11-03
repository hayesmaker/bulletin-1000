import type { BadgeStatus, Store } from '#/lib/project'
import itchLogo from './stores/itchio-white.svg?url'

// Stores for the packshot badge. Logos are white, for the dark badge; see
// stores/README.md for where each comes from and its brand guidelines.
// To add one, add its id to `storeSchema` in src/lib/project.ts.
export const stores: Record<
  Store,
  {
    name: string
    logo: string
    // The logo's width / height, so it's never distorted.
    aspect: number
    // The badge border.
    accent: string
  }
> = {
  itch: {
    name: 'itch.io',
    logo: itchLogo,
    aspect: 774.78 / 198.93,
    // itch.io's brand colour.
    accent: '#fa5c5c',
  },
}

export const badgeStatuses: Record<
  BadgeStatus,
  { label: string; preposition: string }
> = {
  'out-now': { label: 'Out now', preposition: 'on' },
  'coming-soon': { label: 'Coming soon', preposition: 'to' },
}
