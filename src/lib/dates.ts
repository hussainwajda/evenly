/**
 * Budget "months" are cycles. With monthStartDay = 1 a cycle is the calendar month.
 * With monthStartDay = 15 the cycle "2026-09" runs 15 Sep → 14 Oct.
 * A cycle is labelled by the month it starts in.
 */

export type MonthKey = `${number}-${string}`

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function clampStart(year: number, monthIndex: number, startDay: number): Date {
  return new Date(year, monthIndex, Math.min(Math.max(1, startDay), daysInMonth(year, monthIndex)))
}

export function makeMonthKey(year: number, monthIndex: number): MonthKey {
  const d = new Date(year, monthIndex, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` as MonthKey
}

export function parseMonthKey(key: string): { year: number; monthIndex: number } {
  const [y, m] = key.split('-').map(Number)
  return { year: y, monthIndex: m - 1 }
}

export function monthKeyOf(date: Date | number, startDay = 1): MonthKey {
  const d = new Date(date)
  const start = clampStart(d.getFullYear(), d.getMonth(), startDay)
  if (d < start) return makeMonthKey(d.getFullYear(), d.getMonth() - 1)
  return makeMonthKey(d.getFullYear(), d.getMonth())
}

export function addMonths(key: string, n: number): MonthKey {
  const { year, monthIndex } = parseMonthKey(key)
  return makeMonthKey(year, monthIndex + n)
}

/** [start, end) in epoch ms. */
export function monthRange(key: string, startDay = 1): { start: number; end: number; days: number } {
  const { year, monthIndex } = parseMonthKey(key)
  const start = clampStart(year, monthIndex, startDay)
  const nextStart = clampStart(new Date(year, monthIndex + 1, 1).getFullYear(), new Date(year, monthIndex + 1, 1).getMonth(), startDay)
  const days = Math.round((nextStart.getTime() - start.getTime()) / 86_400_000)
  return { start: start.getTime(), end: nextStart.getTime(), days }
}

/** 0-based day number within the cycle, or -1 if outside. Uses local calendar days (DST-safe). */
export function dayIndexInRange(date: Date | number, range: { start: number; end: number }): number {
  const t = new Date(date).getTime()
  if (t < range.start || t >= range.end) return -1
  const s = new Date(range.start)
  const d = new Date(t)
  const a = Date.UTC(s.getFullYear(), s.getMonth(), s.getDate())
  const b = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((b - a) / 86_400_000)
}

const monthLabelFmt = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric' })
const monthLongFmt = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' })

export function formatMonthKey(key: string, long = false): string {
  const { year, monthIndex } = parseMonthKey(key)
  return (long ? monthLongFmt : monthLabelFmt).format(new Date(year, monthIndex, 1))
}

export function startOfDay(date: Date | number): number {
  const d = new Date(date)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Value for <input type="datetime-local">. */
export function toDateTimeLocal(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDateTimeLocal(value: string): number {
  const t = new Date(value).getTime()
  return Number.isFinite(t) ? t : Date.now()
}

const dayHeaderFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' })
const shortDateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export function formatDayHeader(ms: number, now = Date.now()): string {
  const today = startOfDay(now)
  const day = startOfDay(ms)
  if (day === today) return 'Today'
  if (today - day === 86_400_000 || (today - day > 82_800_000 && today - day < 90_000_000)) return 'Yesterday'
  return dayHeaderFmt.format(ms)
}

export function formatTime(ms: number): string {
  return timeFmt.format(ms)
}

export function formatShortDate(ms: number): string {
  return shortDateFmt.format(ms)
}

/** DOM id for a calendar day, e.g. "d-2026-09-15". */
export function dayAnchorId(ms: number): string {
  const d = new Date(ms)
  return `d-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const chartDayFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })

/** "15 Sept" for the i-th day of a cycle starting at rangeStart. */
export function cycleDayLabel(rangeStart: number, index: number): string {
  const d = new Date(rangeStart)
  d.setDate(d.getDate() + index)
  return chartDayFmt.format(d)
}

export function cycleDayStart(rangeStart: number, index: number): number {
  const d = new Date(rangeStart)
  d.setDate(d.getDate() + index)
  return d.getTime()
}
