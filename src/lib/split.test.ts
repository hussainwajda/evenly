import { describe, expect, it } from 'vitest'
import { computeShares } from './split'

describe('computeShares', () => {
  it('solo', () => {
    expect(computeShares('solo', 1200, ['a'], null)).toEqual({ my: 1200, shares: [] })
  })

  it('split equally including me', () => {
    const r = computeShares('split', 55600, ['a', 'b'], null)
    expect(r.my).toBe(18534)
    expect(r.shares).toEqual([
      { personId: 'a', amount: 18533 },
      { personId: 'b', amount: 18533 },
    ])
    expect(r.my + r.shares.reduce((x, s) => x + s.amount, 0)).toBe(55600)
  })

  it('split with my custom share', () => {
    expect(computeShares('split', 60000, ['a', 'b'], 30000)).toEqual({
      my: 30000,
      shares: [
        { personId: 'a', amount: 15000 },
        { personId: 'b', amount: 15000 },
      ],
    })
    // clamps an override above the total
    expect(computeShares('split', 1000, ['a'], 5000)).toEqual({ my: 1000, shares: [{ personId: 'a', amount: 0 }] })
  })

  it('for someone: my share is zero', () => {
    expect(computeShares('for', 30000, ['hussain'], null)).toEqual({ my: 0, shares: [{ personId: 'hussain', amount: 30000 }] })
  })

  it('paid by a friend', () => {
    expect(computeShares('paidBy', 30000, ['patil'], null)).toEqual({ my: 30000, shares: [] })
    expect(computeShares('paidBy', 30000, ['patil'], 10000)).toEqual({ my: 10000, shares: [] })
  })

  it('no people selected falls back to all mine', () => {
    expect(computeShares('split', 500, [], null)).toEqual({ my: 500, shares: [] })
    expect(computeShares('for', 500, [], null)).toEqual({ my: 500, shares: [] })
  })
})
