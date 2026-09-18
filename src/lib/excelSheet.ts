/**
 * Pure parser for the user's monthly-expense sheets.
 * Layout: header rows of "day 1 … day 10" cells; the rows below hold "item - amount" text in those day columns.
 * Side columns (e.g. "deal", "alefiya ben cr") and sections ("To pay", "take", "give") are surfaced for review.
 */
import { makeMonthKey, type MonthKey } from './dates'
import { parseQuickAdd } from './quickAdd'

export type Cell = string | number | boolean | Date | null | undefined

export type ParsedKind = 'expense' | 'side' | 'unparsed'

export interface ParsedItem {
  key: string
  row: number
  col: number
  raw: string
  /** 1-based calendar day, when the cell sits in a day column. */
  day: number | null
  name: string
  /** paise */
  amount: number
  received: boolean
  kind: ParsedKind
  /** Label of the side column or section this came from ("deal", "To pay", "mummy dr"…). */
  section: string | null
}

export interface ParsedSheet {
  sheetName: string
  items: ParsedItem[]
  /** paise — the TOTAL typed into the sheet, if any. */
  declaredTotal: number | null
  /** paise — sum of parsed day-column expenses. */
  parsedTotal: number
}

const DAY_RE = /^\s*day\s*(\d{1,2})\s*$/i
const TOTAL_RE = /^\s*total\s*$/i
const SECTION_RE = /^\s*(to pay|to take|to give|take|give|deals?|deal expense|lend|lent|borrow(ed)?|udhaar|received|account balance.*)\s*$/i

function text(c: Cell): string {
  if (c == null) return ''
  if (c instanceof Date) return ''
  return String(c).trim()
}

export function parseSheetRows(sheetName: string, rows: Cell[][]): ParsedSheet {
  const items: ParsedItem[] = []
  let dayCols = new Map<number, number>()
  let sideCols = new Map<number, string>()
  const sectionByCol = new Map<number, string>()
  let declaredTotal: number | null = null
  let afterTotal = false

  const push = (item: Omit<ParsedItem, 'key'>) => items.push({ ...item, key: `${sheetName}:${item.row}:${item.col}` })

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? []

    // Header row: 3+ "day N" cells.
    const dayHits = row.map((c) => text(c).match(DAY_RE))
    if (dayHits.filter(Boolean).length >= 3) {
      dayCols = new Map()
      sideCols = new Map()
      sectionByCol.clear()
      row.forEach((c, col) => {
        const m = dayHits[col]
        if (m) dayCols.set(col, Number(m[1]))
        else if (text(c)) {
          const inline = parseQuickAdd(text(c))
          // "patil - 200" sitting in a header row is an entry, not a column label.
          if (inline) {
            push({ row: r, col, raw: text(c), day: null, name: inline.name, amount: inline.amount, received: inline.received, kind: 'side', section: null })
          } else sideCols.set(col, text(c))
        }
      })
      // Side headers persist for columns without a new header (Feb26 style).
      continue
    }

    for (let col = 0; col < row.length; col++) {
      const raw = text(row[col])
      if (!raw) continue
      if (DAY_RE.test(raw)) continue // stray "day 31" label outside a full header row

      if (TOTAL_RE.test(raw)) {
        const right = row[col + 1]
        const below = rows[r + 1]?.[col]
        const n = typeof right === 'number' ? right : typeof below === 'number' ? below : null
        if (n != null) declaredTotal = Math.round(n * 100)
        afterTotal = true
        sectionByCol.clear()
        continue
      }
      if (typeof row[col] === 'number' && declaredTotal != null && Math.round((row[col] as number) * 100) === declaredTotal) {
        continue // the total value itself
      }

      const day = dayCols.get(col) ?? null
      const sideLabel = sideCols.get(col) ?? null

      if (SECTION_RE.test(raw) && typeof row[col] === 'string') {
        sectionByCol.set(col, raw.replace(/\s+/g, ' '))
        continue
      }

      const section = sectionByCol.get(col) ?? sideLabel ?? (afterTotal ? 'After total' : null)

      if (typeof row[col] === 'number') {
        const amount = Math.round((row[col] as number) * 100)
        push({
          row: r,
          col,
          raw,
          day,
          name: sideLabel ?? sectionByCol.get(col) ?? '',
          amount,
          received: false,
          kind: sideLabel || sectionByCol.has(col) ? 'side' : 'unparsed',
          section,
        })
        continue
      }

      const parsed = parseQuickAdd(raw)
      if (!parsed) {
        push({ row: r, col, raw, day, name: raw, amount: 0, received: false, kind: 'unparsed', section })
        continue
      }
      const kind: ParsedKind = section || parsed.received || day == null ? 'side' : 'expense'
      push({ row: r, col, raw, day, name: parsed.name, amount: parsed.amount, received: parsed.received, kind, section })
    }
  }

  const parsedTotal = items.filter((i) => i.kind === 'expense').reduce((a, i) => a + i.amount, 0)
  return { sheetName, items, declaredTotal, parsedTotal }
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** "november" → {m:10,y:null}; "November24" → {m:10,y:2024}; "june 25" → {m:5,y:2025}. */
export function parseSheetName(name: string): { monthIndex: number; year: number | null } | null {
  const m = name
    .trim()
    .toLowerCase()
    .match(/^([a-z]+)\s*[-_ ]?\s*(\d{2}|\d{4})?$/)
  if (!m) return null
  const monthIndex = MONTHS.findIndex((mm) => m[1].startsWith(mm))
  if (monthIndex < 0) return null
  const y = m[2] ? Number(m[2]) : null
  return { monthIndex, year: y == null ? null : y < 100 ? 2000 + y : y }
}

/**
 * Assigns a month key to every sheet, assuming the workbook is in chronological order.
 * Missing years are inferred from the nearest sheet that has one. Returns null for non-month sheets ("template").
 */
export function inferSheetMonths(names: string[], fallbackYear = new Date().getFullYear()): (MonthKey | null)[] {
  const parsed = names.map(parseSheetName)
  const years: (number | null)[] = parsed.map((p) => p?.year ?? null)

  // Backward pass: from each known year, walk earlier sheets.
  for (let i = parsed.length - 1; i >= 0; i--) {
    if (!parsed[i] || years[i] != null) continue
    for (let j = i + 1; j < parsed.length; j++) {
      if (!parsed[j] || years[j] == null) continue
      // Walk from j back to i.
      let y = years[j] as number
      let nextMonth = parsed[j]!.monthIndex
      for (let k = j - 1; k >= i; k--) {
        if (!parsed[k]) continue
        if (parsed[k]!.monthIndex >= nextMonth) y -= 1
        if (years[k] == null) years[k] = y
        else y = years[k] as number
        nextMonth = parsed[k]!.monthIndex
      }
      break
    }
  }

  // Forward pass for trailing sheets with no later anchor.
  let lastYear: number | null = null
  let lastMonth = -1
  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i]
    if (!p) continue
    if (years[i] == null) {
      const base = lastYear ?? fallbackYear
      years[i] = lastYear != null && p.monthIndex <= lastMonth ? base + 1 : base
    }
    lastYear = years[i]
    lastMonth = p.monthIndex
  }

  return parsed.map((p, i) => (p ? makeMonthKey(years[i] as number, p.monthIndex) : null))
}
