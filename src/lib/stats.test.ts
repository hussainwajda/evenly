import { describe, expect, it } from 'vitest'
import { monthRange } from './dates'
import { monthStats, PAID_BY_FRIEND, spentThroughDay } from './stats'
import type { LedgerEntry, Recurring, Transaction } from './types'

let n = 0
function txn(p: Partial<Transaction> & { amount: number; occurredAt: number }): Transaction {
  n++
  return {
    id: `t${n}`,
    name: p.name ?? 'chai',
    nameLower: (p.name ?? 'chai').toLowerCase(),
    grossAmount: p.grossAmount ?? p.amount,
    categoryId: p.categoryId ?? 'food',
    paymentMethodId: p.paymentMethodId === undefined ? 'upi-navi' : p.paymentMethodId,
    note: '',
    tags: [],
    source: 'manual',
    excludeFromSpend: false,
    paidByPersonId: null,
    shares: [],
    recurringId: null,
    importBatchId: null,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    ...p,
  }
}

const sep = monthRange('2026-09') // 30 days
const d = (day: number, h = 12) => new Date(2026, 8, day, h).getTime()

describe('monthStats', () => {
  const transactions = [
    txn({ name: 'Rent', categoryId: 'home', amount: 525000, occurredAt: d(1) }),
    txn({ name: 'Chai', amount: 1200, occurredAt: d(3) }),
    txn({ name: 'Chai', amount: 2000, occurredAt: d(7) }),
    txn({ name: 'Petrol', categoryId: 'transport', amount: 42000, occurredAt: d(3) }),
    // split: bill 556, my share 185.34
    txn({ name: 'Dmart', categoryId: 'groceries', amount: 18534, grossAmount: 55600, occurredAt: d(5) }),
    // friend paid for me
    txn({ name: 'Movie', categoryId: 'entertainment', amount: 30000, paymentMethodId: null, paidByPersonId: 'p1', occurredAt: d(6) }),
    // excluded deal money
    txn({ name: 'Trunk', amount: 9900, excludeFromSpend: true, occurredAt: d(2) }),
    // deleted
    txn({ name: 'Oops', amount: 99999, occurredAt: d(4), deletedAt: 1 }),
    // other month
    txn({ name: 'Aug chai', amount: 1000, occurredAt: new Date(2026, 7, 31, 23).getTime() }),
  ]
  const ledger: LedgerEntry[] = [
    { id: 'l1', personId: 'p2', type: 'lent', amount: 50000, occurredAt: d(8), note: '', paymentMethodId: 'cash', transactionId: null, importBatchId: null, createdAt: 0, deletedAt: null },
    { id: 'l2', personId: 'p3', type: 'lent', amount: 37066, occurredAt: d(5), note: '', paymentMethodId: null, transactionId: 'tX', importBatchId: null, createdAt: 0, deletedAt: null },
  ]

  const stats = monthStats({
    transactions,
    ledger,
    budget: { total: 1500000, perCategory: { food: 300000, health: 100000 } },
    range: sep,
    now: d(15, 9),
  })

  it('counts only my share, not deleted/excluded/other months', () => {
    expect(stats.spent).toBe(525000 + 1200 + 2000 + 42000 + 18534 + 30000)
    expect(stats.count).toBe(6)
  })

  it('money out = gross bills I paid + standalone lending (+ excluded deals), not friend-paid', () => {
    expect(stats.moneyOut).toBe(525000 + 1200 + 2000 + 42000 + 55600 + 9900 + 50000)
  })

  it('budget figures', () => {
    expect(stats.status).toBe('current')
    expect(stats.daysElapsed).toBe(15)
    expect(stats.daysRemaining).toBe(16)
    expect(stats.left).toBe(1500000 - stats.spent)
    expect(stats.safePerDay).toBe(Math.floor((1500000 - stats.spent) / 16 / 100) * 100)
    expect(stats.safePerDay! % 100).toBe(0)
    expect(stats.dailyAverage % 100).toBe(0)
    expect(stats.projected).toBe(Math.round(((stats.spent / 15) * 30) / 100) * 100)
  })

  it('category breakdown sorted with budgets, including budgeted-but-unspent', () => {
    expect(stats.byCategory[0]).toMatchObject({ categoryId: 'home', amount: 525000 })
    expect(stats.byCategory.find((c) => c.categoryId === 'food')).toMatchObject({ amount: 3200, count: 2, budget: 300000 })
    expect(stats.byCategory.find((c) => c.categoryId === 'health')).toMatchObject({ amount: 0, budget: 100000 })
  })

  it('daily series and cumulative', () => {
    expect(stats.byDay).toHaveLength(30)
    expect(stats.byDay[2]).toBe(43200)
    expect(stats.cumulative[29]).toBe(stats.spent)
  })

  it('top items group by name', () => {
    expect(stats.topItems[0]).toMatchObject({ name: 'Chai', count: 2, amount: 3200 })
  })

  it('friend-paid gets its own payment bucket', () => {
    expect(stats.byPaymentMethod.find((p) => p.paymentMethodId === PAID_BY_FRIEND)?.amount).toBe(30000)
    expect(stats.byPaymentMethod.find((p) => p.paymentMethodId === null)).toBeUndefined()
  })

  it('past and future cycles', () => {
    const past = monthStats({ transactions, budget: null, range: sep, now: new Date(2026, 10, 1).getTime() })
    expect(past).toMatchObject({ status: 'past', daysElapsed: 30, daysRemaining: 0, projected: null, left: null, safePerDay: null })
    const future = monthStats({ transactions, budget: null, range: sep, now: new Date(2026, 5, 1).getTime() })
    expect(future).toMatchObject({ status: 'future', daysElapsed: 0, projected: null, dailyAverage: 0 })
  })

  it('spentThroughDay for month-over-month comparison', () => {
    expect(spentThroughDay(transactions, sep, 2)).toBe(525000 + 1200 + 42000)
  })
})

describe('fixed monthly costs', () => {
  const rec = (name: string, amount: number, extra: Partial<Recurring> = {}): Recurring => ({
    id: `r-${name}`,
    name,
    amount,
    categoryId: 'home',
    paymentMethodId: null,
    dayOfMonth: 1,
    active: true,
    lastAddedMonthKey: null,
    createdAt: 0,
    ...extra,
  })
  const transactions = [
    txn({ name: 'Rent', categoryId: 'home', amount: 525000, occurredAt: d(1) }), // matches template by name
    txn({ name: 'Wifi', categoryId: 'bills', amount: 60000, occurredAt: d(3), recurringId: 'r-old' }), // added from a template
    txn({ name: 'Chai', amount: 3000, occurredAt: d(5) }),
  ]
  const recurring = [
    rec('Rent', 525000),
    rec('Electricity bill', 55000, { dayOfMonth: 20 }), // still to come
    rec('Maid', 126000, { lastAddedMonthKey: '2026-09' }), // skipped this month
    rec('Gym', 80000, { active: false }), // paused
  ]
  const s = monthStats({
    transactions,
    budget: { total: 1200000, perCategory: {} },
    range: sep,
    now: d(10, 9),
    recurring,
    monthKey: '2026-09',
  })

  it('splits fixed and everyday spend, and finds fixed costs still to come', () => {
    expect(s.spent).toBe(588000)
    expect(s.fixedSpent).toBe(585000)
    expect(s.variableSpent).toBe(3000)
    expect(s.upcomingFixed).toBe(55000)
  })

  it('projects only everyday spending forward', () => {
    expect(s.projected).toBe(585000 + 55000 + Math.round((3000 / 10) * 30))
  })

  it('keeps upcoming fixed costs out of safe-per-day', () => {
    expect(s.daysRemaining).toBe(21)
    expect(s.safePerDay).toBe(Math.floor((1200000 - 588000 - 55000) / 21 / 100) * 100)
  })

  it('daily bars, averages and daily budget ignore fixed costs', () => {
    expect(s.byDay[0]).toBe(525000)
    expect(s.byDayVariable[0]).toBe(0)
    expect(s.byDayVariable[4]).toBe(3000)
    expect(s.dailyAverage).toBe(300)
    expect(s.dailyVariableBudget).toBe(Math.round((1200000 - 640000) / 30 / 100) * 100)
  })

  it('past months expect no more fixed costs', () => {
    const past = monthStats({ transactions, budget: null, range: sep, now: new Date(2026, 10, 2).getTime(), recurring, monthKey: '2026-09' })
    expect(past.upcomingFixed).toBe(0)
    expect(past.fixedSpent).toBe(585000)
  })
})
