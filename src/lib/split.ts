import { splitEvenly } from './money'
import type { Share } from './types'

export type SplitMode = 'solo' | 'split' | 'for' | 'paidBy'

/**
 * Works out my share and other people's shares of a bill.
 *  solo   — all mine
 *  split  — I paid; shared equally with the selected people (or I set my share, the rest is split equally)
 *  for    — I paid entirely on their behalf; my share is 0
 *  paidBy — one person paid; my share is the whole bill unless I set it
 */
export function computeShares(
  mode: SplitMode,
  total: number,
  personIds: string[],
  myShareOverride: number | null,
): { my: number; shares: Share[] } {
  const custom = myShareOverride == null ? null : Math.min(Math.max(myShareOverride, 0), total)
  switch (mode) {
    case 'solo':
      return { my: total, shares: [] }
    case 'paidBy':
      return { my: custom ?? total, shares: [] }
    case 'for': {
      if (!personIds.length) return { my: total, shares: [] }
      const parts = splitEvenly(total, personIds.length)
      return { my: 0, shares: personIds.map((personId, i) => ({ personId, amount: parts[i] })) }
    }
    case 'split': {
      if (!personIds.length) return { my: total, shares: [] }
      if (custom != null) {
        const parts = splitEvenly(total - custom, personIds.length)
        return { my: custom, shares: personIds.map((personId, i) => ({ personId, amount: parts[i] })) }
      }
      const parts = splitEvenly(total, personIds.length + 1)
      return { my: parts[0], shares: personIds.map((personId, i) => ({ personId, amount: parts[i + 1] })) }
    }
  }
}
