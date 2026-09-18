import { describe, expect, it } from 'vitest'
import { parseQuickAdd, tidyName } from './quickAdd'

describe('parseQuickAdd', () => {
  it.each([
    ['chai 12', 'chai', 1200],
    ['chai - 12', 'chai', 1200],
    ['petrol-375', 'petrol', 37500],
    ['nashto = 60', 'nashto', 6000],
    ['roll on - 30', 'roll on', 3000],
    ['sehouvryjaman -1000', 'sehouvryjaman', 100000],
    ['chai + food  - 40', 'chai + food', 4000],
    ['cake & chai - 125', 'cake & chai', 12500],
    ['rent  - 10500', 'rent', 1050000],
    ['groceries 1,250.50', 'groceries', 125050],
    ['₹120 dinner', 'dinner', 12000],
    ['rs 50 auto', 'auto', 5000],
    ['train ticket - 460', 'train ticket', 46000],
    ['vc -1000', 'vc', 100000],
    ['mum-dinner- 465', 'mum-dinner', 46500],
  ])('%s → %s %d', (input, name, amount) => {
    expect(parseQuickAdd(input)).toEqual({ name, amount, received: false })
  })

  it('detects "received" suffix', () => {
    expect(parseQuickAdd('fridge  - 1800 received')).toEqual({ name: 'fridge', amount: 180000, received: true })
  })

  it.each(['cng', 'toll', '', '   ', '120', 'day 1', null, undefined])('returns null for %s', (input) => {
    if (input === 'day 1') {
      // "day 1" parses as a name with amount 1 — the Excel importer skips day headers separately.
      expect(parseQuickAdd(input)).toEqual({ name: 'day', amount: 100, received: false })
      return
    }
    expect(parseQuickAdd(input as string)).toBeNull()
  })
})

describe('tidyName', () => {
  it('capitalises and collapses spaces', () => {
    expect(tidyName('  burgur  BUN ')).toBe('Burgur bun')
  })
})
