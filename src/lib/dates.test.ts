import { describe, expect, it } from 'vitest'
import { addMonths, dayIndexInRange, formatMonthKey, monthKeyOf, monthRange } from './dates'

describe('month cycles', () => {
  it('calendar month when start day is 1', () => {
    expect(monthKeyOf(new Date(2026, 8, 15))).toBe('2026-09')
    const r = monthRange('2026-09')
    expect(new Date(r.start)).toEqual(new Date(2026, 8, 1))
    expect(new Date(r.end)).toEqual(new Date(2026, 9, 1))
    expect(r.days).toBe(30)
  })

  it('custom start day shifts the cycle', () => {
    expect(monthKeyOf(new Date(2026, 8, 14), 15)).toBe('2026-08')
    expect(monthKeyOf(new Date(2026, 8, 15), 15)).toBe('2026-09')
    const r = monthRange('2026-09', 15)
    expect(new Date(r.start)).toEqual(new Date(2026, 8, 15))
    expect(new Date(r.end)).toEqual(new Date(2026, 9, 15))
    expect(r.days).toBe(30)
  })

  it('clamps start day 31 in short months', () => {
    const r = monthRange('2026-02', 31)
    expect(new Date(r.start)).toEqual(new Date(2026, 1, 28))
    expect(new Date(r.end)).toEqual(new Date(2026, 2, 31))
  })

  it('handles leap years and year rollover', () => {
    expect(monthRange('2028-02').days).toBe(29)
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(monthKeyOf(new Date(2027, 0, 3), 5)).toBe('2026-12')
  })

  it('day index within cycle', () => {
    const r = monthRange('2026-09')
    expect(dayIndexInRange(new Date(2026, 8, 1, 0, 0), r)).toBe(0)
    expect(dayIndexInRange(new Date(2026, 8, 30, 23, 59), r)).toBe(29)
    expect(dayIndexInRange(new Date(2026, 9, 1), r)).toBe(-1)
  })

  it('labels', () => {
    expect(formatMonthKey('2026-09')).toMatch(/Sept?\s2026/)
  })
})
