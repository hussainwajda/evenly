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

/**
 * The direct debts one bill creates: each person's share is owed to the payer(s), split between
 * several payers in proportion to what they paid. Self-debts are left out.
 */
export function expenseDebts(e: GroupExpense): Transfer[] {
  const payers = e.payers.filter((p) => p.amount > 0)
  if (!payers.length) return []
  const out: Transfer[] = []
  for (const s of e.shares) {
    const parts = largestRemainder(s.amount, payers.map((p) => p.amount))
    payers.forEach((p, i) => {
      if (p.memberId !== s.memberId && parts[i]) out.push({ from: s.memberId, to: p.memberId, amount: parts[i] })
    })
  }
  return out
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
    for (const d of expenseDebts(e)) owe(d.from, d.to, d.amount)
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

/** A payment (or part of one) that paid off a share. */
export interface Coverage {
  settlementId: string
  amount: number
}

export interface ShareStatus {
  memberId: string
  payerId: string | null
  share: number
  paid: number
  remaining: number
  state: ShareState
  /**
   * "Balanced out": no payment covers it, but with simplify on the person's overall group balance
   * is clear, so they have nothing left to pay.
   */
  settledOverall: boolean
  /** The payments that paid this share off, oldest first. */
  coveredBy: Coverage[]
}

/**
 * Paid status of every share:
 *  • "I've paid" payments tied to an expense count toward that share;
 *  • general settle-up payments between two people fill that pair's oldest open shares first
 *    (oldest payment first);
 *  • with simplify on, anyone whose overall balance is clear has their shares shown as balanced out.
 */
export function shareStatuses(expenses: GroupExpense[], settlements: Settlement[], simplify: boolean): Map<string, ShareStatus[]> {
  const live = expenses.filter((e) => !e.deletedAt).sort((a, b) => a.occurredAt - b.occurredAt || a.id.localeCompare(b.id))
  const nets = memberNets(expenses, settlements)
  const covered = new Map<string, Coverage[]>()
  const unconfirmed = new Set<string>()
  const pools = new Map<string, { s: Settlement; left: number }[]>()
  const cover = (key: string, s: Settlement, amount: number) => {
    covered.set(key, [...(covered.get(key) ?? []), { settlementId: s.id, amount }])
    if (s.status !== 'confirmed') unconfirmed.add(key)
  }
  const sum = (key: string) => (covered.get(key) ?? []).reduce((a, c) => a + c.amount, 0)

  const ordered = settlements.filter(counts).sort((a, b) => a.occurredAt - b.occurredAt || a.id.localeCompare(b.id))
  for (const s of ordered) {
    if (s.expenseId) cover(`${s.expenseId}|${s.from}`, s, s.amount)
    else {
      const key = `${s.from}>${s.to}`
      pools.set(key, [...(pools.get(key) ?? []), { s, left: s.amount }])
    }
  }

  const payerOf = (e: GroupExpense) => e.payers.find((p) => p.amount > 0)?.memberId ?? null

  for (const e of live) {
    const payer = payerOf(e)
    if (!payer) continue
    for (const sh of e.shares) {
      if (sh.memberId === payer) continue
      const key = `${e.id}|${sh.memberId}`
      for (const p of pools.get(`${sh.memberId}>${payer}`) ?? []) {
        const need = sh.amount - sum(key)
        if (need <= 0) break
        if (p.left <= 0) continue
        const take = Math.min(p.left, need)
        p.left -= take
        cover(key, p.s, take)
      }
    }
  }

  const result = new Map<string, ShareStatus[]>()
  for (const e of live) {
    const payer = payerOf(e)
    result.set(
      e.id,
      e.shares.map((sh): ShareStatus => {
        const key = `${e.id}|${sh.memberId}`
        if (sh.memberId === payer) {
          return { memberId: sh.memberId, payerId: payer, share: sh.amount, paid: sh.amount, remaining: 0, state: 'payer', settledOverall: false, coveredBy: [] }
        }
        const coveredBy = covered.get(key) ?? []
        let p = Math.min(sum(key), sh.amount)
        let settledOverall = false
        if (p < sh.amount && simplify && (nets.get(sh.memberId) ?? 0) >= 0) {
          p = sh.amount
          settledOverall = true
        }
        const remaining = sh.amount - p
        const state: ShareState =
          remaining === 0 ? (settledOverall || unconfirmed.has(key) ? 'paid' : 'confirmed') : p > 0 ? 'partial' : 'pending'
        return { memberId: sh.memberId, payerId: payer, share: sh.amount, paid: p, remaining, state, settledOverall, coveredBy }
      }),
    )
  }
  return result
}

export interface PaidOff {
  expenseId: string
  memberId: string
  amount: number
}

/** The other way round: for each payment, the shares it paid off. Whatever isn't listed is extra credit. */
export function paymentAllocations(statuses: Map<string, ShareStatus[]>): Map<string, PaidOff[]> {
  const out = new Map<string, PaidOff[]>()
  for (const [expenseId, list] of statuses) {
    for (const st of list) {
      for (const c of st.coveredBy) {
        out.set(c.settlementId, [...(out.get(c.settlementId) ?? []), { expenseId, memberId: st.memberId, amount: c.amount }])
      }
    }
  }
  return out
}

/* ───────────────────────── Explaining balances ───────────────────────── */

export interface PairRow {
  kind: 'expense' | 'settlement'
  id: string
  at: number
  expense?: GroupExpense
  settlement?: Settlement
  /** What `b` owes `a` because of this bill (bills only). */
  bOwesA: number
  /** What `a` owes `b` because of this bill (bills only). */
  aOwesB: number
  /** Change to "b owes a". Positive: b owes a more. 0 for items that don't count (deleted, disputed). */
  delta: number
  /** "b owes a" after this row (negative: a owes b). */
  running: number
  counts: boolean
}

export interface PairLedger {
  rows: PairRow[]
  /** Final "b owes a"; always equals the direct (non-simplified) balance between the two. */
  balance: number
  /** Live bills in the group that didn't move money between these two. */
  otherBills: number
}

/**
 * Statement between two members: every bill and payment that moved money between `a` and `b`,
 * oldest first, with a running balance. Deleted bills and deleted or disputed payments are listed
 * but not counted.
 */
export function pairLedger(expenses: GroupExpense[], settlements: Settlement[], a: string, b: string): PairLedger {
  const items: Omit<PairRow, 'running'>[] = []
  let otherBills = 0
  for (const e of expenses) {
    let bOwesA = 0
    let aOwesB = 0
    for (const d of expenseDebts(e)) {
      if (d.from === b && d.to === a) bOwesA += d.amount
      else if (d.from === a && d.to === b) aOwesB += d.amount
    }
    if (!bOwesA && !aOwesB) {
      if (!e.deletedAt) otherBills++
      continue
    }
    const live = !e.deletedAt
    items.push({ kind: 'expense', id: e.id, at: e.occurredAt, expense: e, bOwesA, aOwesB, delta: live ? bOwesA - aOwesB : 0, counts: live })
  }
  for (const s of settlements) {
    const sign = s.from === b && s.to === a ? -1 : s.from === a && s.to === b ? 1 : 0
    if (!sign) continue
    const c = counts(s)
    items.push({ kind: 'settlement', id: s.id, at: s.occurredAt, settlement: s, bOwesA: 0, aOwesB: 0, delta: c ? sign * s.amount : 0, counts: c })
  }
  items.sort((x, y) => x.at - y.at || (x.kind === y.kind ? x.id.localeCompare(y.id) : x.kind === 'expense' ? -1 : 1))
  let running = 0
  const rows = items.map((it) => {
    running += it.delta
    return { ...it, running }
  })
  return { rows, balance: running, otherBills }
}

export interface NetBreakdown {
  /** Total this member paid for bills. */
  paid: number
  /** Total of this member's shares. */
  share: number
  /** Payments they made to others. */
  sent: number
  /** Payments they received from others. */
  received: number
  /** paid − share + sent − received; positive = the group owes them. */
  net: number
}

export function netBreakdown(expenses: GroupExpense[], settlements: Settlement[], memberId: string): NetBreakdown {
  let paid = 0
  let share = 0
  let sent = 0
  let received = 0
  for (const e of expenses) {
    if (e.deletedAt) continue
    paid += e.payers.find((p) => p.memberId === memberId)?.amount ?? 0
    share += e.shares.find((s) => s.memberId === memberId)?.amount ?? 0
  }
  for (const s of settlements) {
    if (!counts(s)) continue
    if (s.from === memberId) sent += s.amount
    if (s.to === memberId) received += s.amount
  }
  return { paid, share, sent, received, net: paid - share + sent - received }
}

/** My position in one expense: what I paid, my share, and what I lent (+) or borrowed (−). */
export function myRole(e: GroupExpense, meId: string | null): { paid: number; share: number; lent: number } {
  if (!meId) return { paid: 0, share: 0, lent: 0 }
  const paid = e.payers.find((p) => p.memberId === meId)?.amount ?? 0
  const share = e.shares.find((s) => s.memberId === meId)?.amount ?? 0
  return { paid, share, lent: paid - share }
}

/* ───────────────────────── Payment rules ───────────────────────── */

/** Only the person who received a payment can confirm it or say it never arrived. */
export function canConfirmPayment(s: Settlement, meId: string | null): boolean {
  return Boolean(meId) && s.to === meId
}

/**
 * Only the person who recorded a payment, or the receiver, can delete, restore or edit it.
 * Payments from before history existed don't say who recorded them, so either side may.
 */
export function canManagePayment(s: Settlement, meId: string | null): boolean {
  if (!meId) return false
  if (s.to === meId || s.createdBy === meId) return true
  return !s.createdBy && s.from === meId
}
