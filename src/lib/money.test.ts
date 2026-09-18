import { describe, expect, it } from 'vitest'
import { formatINR, paiseToInput, splitEvenly, toPaise } from './money'

describe('money', () => {
  it('converts rupees to paise without float drift', () => {
    expect(toPaise(0.1 + 0.2)).toBe(30)
    expect(toPaise('1,23,456.78')).toBe(12345678)
    expect(toPaise('₹ 12')).toBe(1200)
    expect(toPaise('abc')).toBe(0)
  })

  it('formats Indian grouping', () => {
    expect(formatINR(12345600)).toBe('₹1,23,456')
    expect(formatINR(1250)).toBe('₹12.50')
    expect(formatINR(-50000)).toBe('−₹500')
    expect(formatINR(50000, { signed: true })).toBe('+₹500')
  })

  it('splits evenly and preserves the total', () => {
    const shares = splitEvenly(55600, 3)
    expect(shares).toEqual([18534, 18533, 18533])
    expect(shares.reduce((a, b) => a + b)).toBe(55600)
    expect(splitEvenly(100, 0)).toEqual([])
  })

  it('formats for inputs', () => {
    expect(paiseToInput(120000)).toBe('1200')
    expect(paiseToInput(12050)).toBe('120.50')
    expect(paiseToInput(0)).toBe('')
  })
})
