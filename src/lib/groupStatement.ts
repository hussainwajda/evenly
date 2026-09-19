/** Plain-text and CSV versions of a two-person statement, for sharing on WhatsApp or opening in Excel. */
import { formatShortDate } from './dates'
import type { PairLedger, PairRow } from './groupMath'
import { formatINR, toRupees } from './money'

type Name = (memberId: string | null | undefined) => string

const payerNames = (row: PairRow, name: Name) =>
  (row.expense?.payers ?? [])
    .filter((p) => p.amount > 0)
    .map((p) => name(p.memberId))
    .join(' & ')

/** One line explaining how a row moved the balance, e.g. "Rahul's share ₹300 → Rahul owes Aadit". */
export function rowReason(row: PairRow, a: string, b: string, name: Name): string {
  if (row.kind === 'settlement') {
    const s = row.settlement!
    return `${name(s.from)} paid ${name(s.to)} ${formatINR(s.amount)} (${s.method.toUpperCase()})`
  }
  const parts: string[] = []
  if (row.bOwesA) parts.push(`${name(b)} owes ${name(a)} ${formatINR(row.bOwesA)}`)
  if (row.aOwesB) parts.push(`${name(a)} owes ${name(b)} ${formatINR(row.aOwesB)}`)
  return parts.join(' · ')
}

/** "Rahul owes Aadit ₹200", or "All settled". `balance` is what b owes a. */
export function balanceSentence(balance: number, a: string, b: string, name: Name): string {
  if (balance > 0) return `${name(b)} owes ${name(a)} ${formatINR(balance)}`
  if (balance < 0) return `${name(a)} owes ${name(b)} ${formatINR(-balance)}`
  return 'All settled'
}

const rowStatus = (row: PairRow) => {
  if (row.kind === 'expense') return row.counts ? '' : ' [deleted, not counted]'
  const s = row.settlement!
  if (s.deletedAt) return ' [deleted, not counted]'
  if (s.status === 'disputed') return ' [not received, not counted]'
  return s.status === 'recorded' ? ' [waiting for confirmation]' : ' [confirmed]'
}

export function statementText(opts: { ledger: PairLedger; rows: PairRow[]; a: string; b: string; name: Name; groupName: string; scope: string }): string {
  const { ledger, rows, a, b, name, groupName, scope } = opts
  const lines = [`Evenly · ${groupName}`, `${name(a)} & ${name(b)}: ${scope}`, '']
  for (const row of rows) {
    const title =
      row.kind === 'expense'
        ? `${row.expense!.title} (${formatINR(row.expense!.amount)}, paid by ${payerNames(row, name)})`
        : 'Payment'
    const change = row.delta ? ` → ${formatINR(row.delta, { signed: true })}` : ''
    lines.push(`${formatShortDate(row.at)} · ${title}: ${rowReason(row, a, b, name)}${change}${rowStatus(row)}`)
  }
  lines.push('', `Balance: ${balanceSentence(ledger.balance, a, b, name)}`)
  lines.push(`(+ means ${name(b)} owes ${name(a)} more, − means less)`)
  return lines.join('\n')
}

const csvCell = (v: string | number) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function statementCsv(opts: { rows: PairRow[]; a: string; b: string; name: Name }): string {
  const { rows, a, b, name } = opts
  const header = ['Date', 'Type', 'Item', 'Bill amount', 'Paid by', 'What it means', 'Counted', `Change (${name(b)} owes ${name(a)})`, 'Balance after']
  const body = rows.map((row) =>
    [
      formatShortDate(row.at),
      row.kind === 'expense' ? 'Bill' : 'Payment',
      row.kind === 'expense' ? row.expense!.title : (row.settlement!.note || 'Payment'),
      row.kind === 'expense' ? toRupees(row.expense!.amount) : toRupees(row.settlement!.amount),
      row.kind === 'expense' ? payerNames(row, name) : name(row.settlement!.from),
      rowReason(row, a, b, name),
      row.counts ? 'yes' : 'no',
      toRupees(row.delta),
      toRupees(row.running),
    ]
      .map(csvCell)
      .join(','),
  )
  return [header.map(csvCell).join(','), ...body].join('\n')
}
