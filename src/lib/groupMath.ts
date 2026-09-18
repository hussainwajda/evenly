/**
 * Pure maths for shared groups: splitting a bill, balances, who-owes-whom, simplifying debts,
 * and the paid/confirmed status of each person's share.
 */
import type { GroupExpense, GroupSplitMethod, MemberAmount, Settlement, SplitEntry } from './groupTypes'
import { formatINR } from './money'

/** Splits `total` by integer weights. Largest-remainder rounding, so parts always add up to `total`. */
export function largestRemainder(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0) return weights.map(() => 0)
  const raw = weights.map((w) => (total * w) / sum)
  const parts = raw.map((r) => Math.floor(r))
  let rest = total - parts.reduce((a, b) => a + b, 0)
  const order = raw.map((r, i) => ({ i, frac: r - parts[i] })).sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const { i } of order) {
    if (rest <= 0) break
    parts[i]++
    rest--
  }
  return parts
}

export interface SplitResult {
  shares: MemberAmount[]
  /** Human message when the split doesn't add up yet, e.g. "₹20 left to assign". */
  error: string | null
}

const pct = (bp: number) => `${(bp / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`

export function computeGroupShares(method: GroupSplitMethod, total: number, entries: SplitEntry[]): SplitResult {
  const active = entries.filter((e) => e.value > 0)
  if (total <= 0) return { shares: [], error: 'Enter an amount' }
  if (!active.length) return { shares: [], error: 'Choose who shares this' }
  const withParts = (parts: number[]) => active.map((e, i) => ({ memberId: e.memberId, amount: parts[i] }))

  switch (method) {
    case 'equal':
      return { shares: withParts(largestRemainder(total, active.map(() => 1))), error: null }
    case 'shares':
      return { shares: withParts(largestRemainder(total, active.map((e) => e.value))), error: null }
    case 'percent': {
      const sum = active.reduce((a, e) => a + e.value, 0)
      const error = sum === 10000 ? null : sum < 10000 ? `${pct(10000 - sum)} left to assign` : `${pct(sum - 10000)} over 100%`
      return { shares: withParts(largestRemainder(total, active.map((e) => e.value))), error }
    }
    case 'exact': {
      const sum = active.reduce((a, e) => a + e.value, 0)
      const error =
        sum === total ? null : sum < total ? `${formatINR(total - sum)} left to assign` : `${formatINR(sum - total)} more than the total`
      return { shares: active.map((e) => ({ memberId: e.memberId, amount: e.value })), error }
    }
  }
}

const counts = (s: Settlement) => !s.deletedAt && s.status !== 'disputed'

/** Per member: paid − share + payments sent − payments received. Positive = others owe them. Always sums to 0. */
export function memberNets(expenses: GroupExpense[], settlements: Settlement[]): Map<string, number> {
  const net = new Map<string, number>()
  const add = (m: string, v: number) => net.set(m, (net.get(m) ?? 0) + v)
  for (const e of expenses) {
    if (e.deletedAt) continue
    for (const p of e.payers) add(p.memberId, p.amount)
    for (const s of e.shares) add(s.memberId, -s.amount)
  }
  for (const s of settlements) {
    if (!counts(s)) continue
    add(s.from, s.amount)
    add(s.to, -s.amount)
  }
  return net
}

export interface Transfer {
  from: string
  to: string
  amount: number
}

/** Who owes whom, pair by pair (no simplification). */
export function pairwiseDebts(expenses: GroupExpense[], settlements: Settlement[]): Transfer[] {
  const pair = new Map<string, number>() // "a|b" with a < b; positive → a owes b
  const owe = (debtor: string, creditor: string, amount: number) => {
    if (debtor === creditor || !amount) return
    const [a, b, sign] = debtor < creditor ? ([debtor, creditor, 1] as const) : ([creditor, debtor, -1] as const)
    const key = `${a}|${b}`
    pair.set(key, (pair.get(key) ?? 0) + sign * amount)
  }
  for (const e of expenses) {
    if (e.deletedAt) continue
    const payers = e.payers.filter((p) => p.amount > 0)
    if (!payers.length) continue
    for (const s of e.shares) {
      const parts = largestRemainder(s.amount, payers.map((p) => p.amount))
      payers.forEach((p, i) => owe(s.memberId, p.memberId, parts[i]))
    }
  }
  for (const s of settlements) if (counts(s)) owe(s.from, s.to, -s.amount)

  const out: Transfer[] = []
  for (const [key, v] of pair) {
    if (!v) continue
    const [a, b] = key.split('|')
    out.push(v > 0 ? { from: a, to: b, amount: v } : { from: b, to: a, amount: -v })
  }
  return out.sort((x, y) => y.amount - x.amount)
}

/** Fewest payments that settle everyone: repeatedly match the biggest debtor with the biggest creditor. */
export function simplifyDebts(nets: Map<string, number>): Transfer[] {
  const creditors = [...nets].filter(([, v]) => v > 0).map(([m, v]) => ({ m, v }))
  const debtors = [...nets].filter(([, v]) => v < 0).map(([m, v]) => ({ m, v: -v }))
  const byBiggest = (a: { m: string; v: number }, b: { m: string; v: number }) => b.v - a.v || a.m.localeCompare(b.m)
  const out: Transfer[] = []
  while (creditors.length && debtors.length) {
    creditors.sort(byBiggest)
    debtors.sort(byBiggest)
    const c = creditors[0]
    const d = debtors[0]
    const amount = Math.min(c.v, d.v)
    out.push({ from: d.m, to: c.m, amount })
    c.v -= amount
    d.v -= amount
    if (!c.v) creditors.shift()
    if (!d.v) debtors.shift()
  }
  return out
}

export function groupTransfers(simplify: boolean, expenses: GroupExpense[], settlements: Settlement[]): Transfer[] {
  return simplify ? simplifyDebts(memberNets(expenses, settlements)) : pairwiseDebts(expenses, settlements)
}

export type ShareState = 'payer' | 'pending' | 'partial' | 'paid' | 'confirmed'

export interface ShareStatus {
  memberId: string
  payerId: string | null
  share: number
  paid: number
  remaining: number
  state: ShareState
  /** Settled because the person's overall group balance is clear (simplified payments), not by a direct payment. */
  settledOverall: boolean
}

/**
 * Paid status of every share:
 *  • "I've paid" payments tied to an expense count toward that share;
 *  • general settle-up payments between two people fill that pair's oldest open shares first;
 *  • with simplify on, anyone whose overall balance is clear has their shares shown as settled.
 */
export function shareStatuses(expenses: GroupExpense[], settlements: Settlement[], simplify: boolean): Map<string, ShareStatus[]> {
  const live = expenses.filter((e) => !e.deletedAt).sort((a, b) => a.occurredAt - b.occurredAt || a.id.localeCompare(b.id))
  const nets = memberNets(expenses, settlements)
  const paid = new Map<string, number>()
  const unconfirmed = new Set<string>()
  const pool = new Map<string, { amount: number; confirmed: boolean }>()

  for (const s of settlements) {
    if (!counts(s)) continue
    if (s.expenseId) {
      const key = `${s.expenseId}|${s.from}`
      paid.set(key, (paid.get(key) ?? 0) + s.amount)
      if (s.status !== 'confirmed') unconfirmed.add(key)
    } else {
      const key = `${s.from}>${s.to}`
      const cur = pool.get(key) ?? { amount: 0, confirmed: true }
      cur.amount += s.amount
      cur.confirmed = cur.confirmed && s.status === 'confirmed'
      pool.set(key, cur)
    }
  }

  const payerOf = (e: GroupExpense) => e.payers.find((p) => p.amount > 0)?.memberId ?? null

  for (const e of live) {
    const payer = payerOf(e)
    if (!payer) continue
    for (const s of e.shares) {
      if (s.memberId === payer) continue
      const key = `${e.id}|${s.memberId}`
      const already = paid.get(key) ?? 0
      if (already >= s.amount) continue
      const p = pool.get(`${s.memberId}>${payer}`)
      if (!p || p.amount <= 0) continue
      const take = Math.min(p.amount, s.amount - already)
      p.amount -= take
      paid.set(key, already + take)
      if (!p.confirmed) unconfirmed.add(key)
    }
  }

  const result = new Map<string, ShareStatus[]>()
  for (const e of live) {
    const payer = payerOf(e)
    result.set(
      e.id,
      e.shares.map((s): ShareStatus => {
        const key = `${e.id}|${s.memberId}`
        if (s.memberId === payer) {
          return { memberId: s.memberId, payerId: payer, share: s.amount, paid: s.amount, remaining: 0, state: 'payer', settledOverall: false }
        }
        let p = Math.min(paid.get(key) ?? 0, s.amount)
        let settledOverall = false
        if (p < s.amount && simplify && (nets.get(s.memberId) ?? 0) >= 0) {
          p = s.amount
          settledOverall = true
        }
        const remaining = s.amount - p
        const state: ShareState =
          remaining === 0 ? (settledOverall || unconfirmed.has(key) ? 'paid' : 'confirmed') : p > 0 ? 'partial' : 'pending'
        return { memberId: s.memberId, payerId: payer, share: s.amount, paid: p, remaining, state, settledOverall }
      }),
    )
  }
  return result
}

/** My position in one expense: what I paid, my share, and what I lent (+) or borrowed (−). */
export function myRole(e: GroupExpense, meId: string | null): { paid: number; share: number; lent: number } {
  if (!meId) return { paid: 0, share: 0, lent: 0 }
  const paid = e.payers.find((p) => p.memberId === meId)?.amount ?? 0
  const share = e.shares.find((s) => s.memberId === meId)?.amount ?? 0
  return { paid, share, lent: paid - share }
}
