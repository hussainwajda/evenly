import { dayIndexInRange } from './dates'
import type { LedgerEntry, Recurring, Transaction } from './types'

/** Payment-method bucket for bills someone else paid. `null` means "not recorded" (e.g. imported rows). */
export const PAID_BY_FRIEND = 'paid-by-friend'

export interface Range {
  start: number
  end: number
  days: number
}

export interface CategoryStat {
  categoryId: string
  amount: number
  count: number
  budget: number | null
}

export interface ItemStat {
  name: string
  count: number
  amount: number
}

export interface MonthStats {
  spent: number
  /** Money that left my accounts: bills I paid in full + standalone lending/repayments. */
  moneyOut: number
  count: number
  budgetTotal: number | null
  left: number | null
  percentUsed: number | null
  status: 'past' | 'current' | 'future'
  daysElapsed: number
  /** Includes today for the current cycle. */
  daysRemaining: number
  /** Everyday spending allowance per remaining day, after setting aside fixed costs still to come. */
  safePerDay: number | null
  /** Fixed costs counted once + everyday spending projected over the whole cycle. */
  projected: number | null
  /** Average everyday (non-fixed) spend per elapsed day. */
  dailyAverage: number
  /** Spent on fixed monthly costs: expenses matching an active recurring expense. */
  fixedSpent: number
  /** Active recurring costs not recorded (or skipped) yet this cycle. */
  upcomingFixed: number
  /** Everything except fixed costs. */
  variableSpent: number
  /** (Budget − all fixed costs) spread evenly over the cycle. */
  dailyVariableBudget: number | null
  byCategory: CategoryStat[]
  byDay: number[]
  /** Daily spend excluding fixed costs. */
  byDayVariable: number[]
  cumulative: number[]
  byPaymentMethod: { paymentMethodId: string | null; amount: number }[]
  topItems: ItemStat[]
  biggest: Transaction | null
}

export function isLive<T extends { deletedAt: number | null }>(x: T): boolean {
  return !x.deletedAt
}

function inRange(t: number, r: Range) {
  return t >= r.start && t < r.end
}

const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

export function monthStats(input: {
  transactions: Transaction[]
  ledger?: LedgerEntry[]
  budget: { total: number; perCategory: Record<string, number> } | null
  range: Range
  now: number
  /** Recurring templates — their expenses are treated as fixed costs. */
  recurring?: Recurring[]
  /** Cycle key, used to tell whether a recurring cost was already added or skipped this month. */
  monthKey?: string
}): MonthStats {
  const { range, now, budget } = input
  const txns = input.transactions.filter((t) => isLive(t) && inRange(t.occurredAt, range))
  const spendTxns = txns.filter((t) => !t.excludeFromSpend)

  const activeRecurring = (input.recurring ?? []).filter((r) => r.active)
  const fixedNames = new Set(activeRecurring.map((r) => normalizeName(r.name)))
  const isFixed = (t: Transaction) => t.recurringId != null || fixedNames.has(t.nameLower)

  const byDay = new Array<number>(range.days).fill(0)
  const byDayVariable = new Array<number>(range.days).fill(0)
  const catMap = new Map<string, CategoryStat>()
  const pmMap = new Map<string | null, number>()
  const itemMap = new Map<string, ItemStat>()
  const paidFixedNames = new Set<string>()
  const paidRecurringIds = new Set<string>()
  let spent = 0
  let fixedSpent = 0
  let biggest: Transaction | null = null

  for (const t of spendTxns) {
    spent += t.amount
    const di = dayIndexInRange(t.occurredAt, range)
    if (di >= 0) byDay[di] += t.amount

    if (isFixed(t)) {
      fixedSpent += t.amount
      paidFixedNames.add(t.nameLower)
      if (t.recurringId) paidRecurringIds.add(t.recurringId)
    } else if (di >= 0) {
      byDayVariable[di] += t.amount
    }

    const c = catMap.get(t.categoryId) ?? { categoryId: t.categoryId, amount: 0, count: 0, budget: null }
    c.amount += t.amount
    c.count += 1
    catMap.set(t.categoryId, c)

    const pmKey = t.paidByPersonId ? PAID_BY_FRIEND : t.paymentMethodId
    pmMap.set(pmKey, (pmMap.get(pmKey) ?? 0) + t.amount)

    const key = t.nameLower
    const it = itemMap.get(key) ?? { name: t.name, count: 0, amount: 0 }
    it.count += 1
    it.amount += t.amount
    itemMap.set(key, it)

    if (!biggest || t.amount > biggest.amount) biggest = t
  }

  if (budget) {
    for (const [categoryId, amount] of Object.entries(budget.perCategory)) {
      if (!amount) continue
      const c = catMap.get(categoryId) ?? { categoryId, amount: 0, count: 0, budget: null }
      c.budget = amount
      catMap.set(categoryId, c)
    }
  }

  let moneyOut = 0
  for (const t of txns) if (!t.paidByPersonId) moneyOut += t.grossAmount
  for (const e of input.ledger ?? []) {
    if (!isLive(e) || e.transactionId || !inRange(e.occurredAt, range)) continue
    if (e.type === 'lent' || e.type === 'repaid') moneyOut += e.amount
  }

  const status: MonthStats['status'] = now < range.start ? 'future' : now >= range.end ? 'past' : 'current'
  const todayIndex = status === 'current' ? dayIndexInRange(now, range) : -1
  const daysElapsed = status === 'future' ? 0 : status === 'past' ? range.days : todayIndex + 1
  const daysRemaining = status === 'current' ? range.days - todayIndex : status === 'future' ? range.days : 0

  const upcomingFixed =
    status === 'past'
      ? 0
      : activeRecurring
          .filter(
            (r) =>
              r.lastAddedMonthKey !== input.monthKey &&
              !paidRecurringIds.has(r.id) &&
              !paidFixedNames.has(normalizeName(r.name)),
          )
          .reduce((a, r) => a + r.amount, 0)
  const variableSpent = spent - fixedSpent
  const fixedExpected = fixedSpent + upcomingFixed

  const budgetTotal = budget && budget.total > 0 ? budget.total : null
  const left = budgetTotal != null ? budgetTotal - spent : null
  const percentUsed = budgetTotal != null ? spent / budgetTotal : null
  // Whole rupees, rounded down so following it never overshoots the budget.
  const safePerDay =
    left != null && daysRemaining > 0 ? Math.max(0, Math.floor((left - upcomingFixed) / daysRemaining / 100) * 100) : null
  const toRupee = (paise: number) => Math.round(paise / 100) * 100
  const projected =
    status === 'current' && daysElapsed > 0 ? fixedExpected + toRupee((variableSpent / daysElapsed) * range.days) : null
  const dailyVariableBudget = budgetTotal != null ? Math.max(0, toRupee((budgetTotal - fixedExpected) / range.days)) : null

  const cumulative: number[] = []
  byDay.reduce((acc, v, i) => (cumulative[i] = acc + v), 0)

  return {
    spent,
    moneyOut,
    count: spendTxns.length,
    budgetTotal,
    left,
    percentUsed,
    status,
    daysElapsed,
    daysRemaining,
    safePerDay,
    projected,
    dailyAverage: daysElapsed > 0 ? Math.round(variableSpent / daysElapsed / 100) * 100 : 0,
    fixedSpent,
    upcomingFixed,
    variableSpent,
    dailyVariableBudget,
    byCategory: [...catMap.values()].sort((a, b) => b.amount - a.amount),
    byDay,
    byDayVariable,
    cumulative,
    byPaymentMethod: [...pmMap.entries()]
      .map(([paymentMethodId, amount]) => ({ paymentMethodId, amount }))
      .sort((a, b) => b.amount - a.amount),
    topItems: [...itemMap.values()].sort((a, b) => b.count - a.count || b.amount - a.amount).slice(0, 5),
    biggest,
  }
}

/** Spend in a cycle from its first day through `dayIndex` (inclusive) — for "vs last month at this point". */
export function spentThroughDay(transactions: Transaction[], range: Range, dayIndex: number): number {
  let total = 0
  for (const t of transactions) {
    if (!isLive(t) || t.excludeFromSpend) continue
    const di = dayIndexInRange(t.occurredAt, range)
    if (di >= 0 && di <= dayIndex) total += t.amount
  }
  return total
}
