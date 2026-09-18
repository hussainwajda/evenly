import { describe, expect, it } from 'vitest'
import { inferSheetMonths, parseSheetName, parseSheetRows } from './excelSheet'

describe('parseSheetName', () => {
  it.each([
    ['november', 10, null],
    ['November24', 10, 2024],
    ['Dec24', 11, 2024],
    ['june 25', 5, 2025],
    ['sep26', 8, 2026],
    ['Feb26', 1, 2026],
    ['August', 7, null],
  ])('%s', (name, monthIndex, year) => {
    expect(parseSheetName(name)).toEqual({ monthIndex, year })
  })

  it('rejects non-month sheets', () => {
    expect(parseSheetName('template')).toBeNull()
  })
})

describe('inferSheetMonths', () => {
  it('matches the real workbook order', () => {
    const names = [
      'november', 'december', 'january', 'february', 'march', 'april', 'may', 'july', 'August', 'September', 'october',
      'November24', 'Dec24', 'march25', 'apr25', 'may25', 'june 25', 'sep25', 'template', 'nov25', 'dec25', 'jan26', 'Feb26',
      'aug26', 'sep26',
    ]
    expect(inferSheetMonths(names)).toEqual([
      '2023-11', '2023-12', '2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-07', '2024-08', '2024-09', '2024-10',
      '2024-11', '2024-12', '2025-03', '2025-04', '2025-05', '2025-06', '2025-09', null, '2025-11', '2025-12', '2026-01', '2026-02',
      '2026-08', '2026-09',
    ])
  })

  it('forward-fills when there is no anchor', () => {
    expect(inferSheetMonths(['november', 'december', 'january'], 2022)).toEqual(['2022-11', '2022-12', '2023-01'])
  })
})

describe('parseSheetRows', () => {
  it('parses day blocks, totals, sections and side columns', () => {
    const rows = [
      ['day 1', 'day 2', 'day 3', null, 'alefiya ben cr'],
      ['chai - 12', 'petrol-375', 'cng', null, 13200],
      ['rent - 5000', null, 'fridge - 1800 received', null, 4840],
      ['day 11', 'day 12', 'day 13'],
      ['To pay', 'poha - 22', null],
      ['hussain - 18100', null, null],
      [null, 'TOTAL ', null],
      [null, 5409, null],
      ['patil - 200', null, null],
    ]
    const sheet = parseSheetRows('apr25', rows)

    const byRaw = Object.fromEntries(sheet.items.map((i) => [i.raw, i]))
    expect(byRaw['chai - 12']).toMatchObject({ kind: 'expense', day: 1, name: 'chai', amount: 1200 })
    expect(byRaw['petrol-375']).toMatchObject({ kind: 'expense', day: 2, amount: 37500 })
    expect(byRaw['rent - 5000']).toMatchObject({ kind: 'expense', day: 1, amount: 500000 })
    expect(byRaw['cng']).toMatchObject({ kind: 'unparsed', day: 3 })
    expect(byRaw['fridge - 1800 received']).toMatchObject({ kind: 'side', received: true, amount: 180000 })
    expect(byRaw['13200']).toMatchObject({ kind: 'side', section: 'alefiya ben cr', amount: 1320000 })
    expect(byRaw['poha - 22']).toMatchObject({ kind: 'expense', day: 12 })
    expect(byRaw['hussain - 18100']).toMatchObject({ kind: 'side', section: 'To pay', name: 'hussain', amount: 1810000 })
    expect(byRaw['patil - 200']).toMatchObject({ kind: 'side', section: 'After total' })

    expect(sheet.declaredTotal).toBe(540900)
    expect(sheet.parsedTotal).toBe(1200 + 37500 + 500000 + 2200)
    expect(sheet.items.find((i) => i.raw === '5409')).toBeUndefined()
  })

  it('ignores a lone "day 31" label and keeps entries found in header rows', () => {
    const rows = [
      ['day 21', 'day 22', 'day 23', null, 'patil - 200'],
      ['coffee - 100', null, 'cake - 50', null, 'fridge - 1800 received'],
      ['day 31', 'TOTAL ', null],
      [null, 150, null],
    ]
    const sheet = parseSheetRows('june 25', rows)
    expect(sheet.items.map((i) => [i.raw, i.kind])).toEqual([
      ['patil - 200', 'side'],
      ['coffee - 100', 'expense'],
      ['cake - 50', 'expense'],
      ['fridge - 1800 received', 'side'],
    ])
    expect(sheet.parsedTotal).toBe(15000)
    expect(sheet.declaredTotal).toBe(15000)
  })
})
