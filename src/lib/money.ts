/** All money is stored as integer paise to avoid floating-point errors. */

export function toPaise(rupees: number | string): number {
  const n = typeof rupees === 'string' ? Number(rupees.replace(/[₹,\s]/g, '')) : rupees
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

export function toRupees(paise: number): number {
  return paise / 100
}

const fmtWhole = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const fmtFraction = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const fmtCompact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** ₹1,23,456 (shows paise only when present). */
export function formatINR(paise: number, opts: { signed?: boolean; compact?: boolean } = {}): string {
  const abs = Math.abs(paise)
  let body: string
  if (opts.compact && abs >= 100_000) body = fmtCompact.format(abs / 100)
  else body = (abs % 100 === 0 ? fmtWhole : fmtFraction).format(abs / 100)
  if (paise < 0) return `−${body}`
  if (opts.signed && paise > 0) return `+${body}`
  return body
}

/** Plain number for inputs: 1234.5 → "1234.50", 1200 → "1200". */
export function paiseToInput(paise: number): string {
  if (!paise) return ''
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2)
}

/** Split a total into n shares that add back up exactly (remainder goes to the first shares). */
export function splitEvenly(totalPaise: number, n: number): number[] {
  if (n <= 0) return []
  const base = Math.floor(totalPaise / n)
  const remainder = totalPaise - base * n
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0))
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}
