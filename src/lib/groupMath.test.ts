import { describe, expect, it } from 'vitest'
import {
  canConfirmPayment,
  canManagePayment,
  computeGroupShares,
  groupTransfers,
  largestRemainder,
  memberNets,
  myRole,
  netBreakdown,
  pairLedger,
  paymentAllocations,
  pairwiseDebts,
  shareStatuses,
  simplifyDebts,
} from './groupMath'
import type { GroupExpense, Settlement } from './groupTypes'

const expense = (id: string, payer: string, amount: number, shares: [string, number][], occurredAt = 1): GroupExpense => ({
  id,
  groupId: 'g',
  title: id,
  amount,
  categoryId: 'food',
  occurredAt,
  note: '',
  createdBy: payer,
  payers: [{ memberId: payer, amount }],
  split: { method: 'exact', entries: shares.map(([memberId, value]) => ({ memberId, value })) },
  shares: shares.map(([memberId, a]) => ({ memberId, amount: a })),
  updatedAt: 1,
  deletedAt: null,
})

const pay = (id: string, from: string, to: string, amount: number, extra: Partial<Settlement> = {}): Settlement => ({
  id,
  groupId: 'g',
  from,
  to,
  amount,
  method: 'upi',
  occurredAt: 10,
  note: '',
  expenseId: null,
  status: 'recorded',
  updatedAt: 1,
  deletedAt: null,
  ...extra,
})

describe('largestRemainder', () => {
  it('always adds up exactly', () => {
    expect(largestRemainder(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(largestRemainder(1000, [2, 1, 1])).toEqual([500, 250, 250])
    expect(largestRemainder(10, [0, 0])).toEqual([0, 0])
  })
})

describe('computeGroupShares', () => {
  const people = (vals: number[]) => vals.map((value, i) => ({ memberId: `m${i + 1}`, value }))

  it('equal among the people included', () => {
    expect(computeGroupShares('equal', 90000, people([1, 1, 0, 1]))).toEqual({
      shares: [
        { memberId: 'm1', amount: 30000 },
        { memberId: 'm2', amount: 30000 },
        { memberId: 'm4', amount: 30000 },
      ],
      error: null,
    })
    expect(computeGroupShares('equal', 10000, people([1, 1, 1])).shares.map((s) => s.amount)).toEqual([3334, 3333, 3333])
  })

  it('shares (weights)', () => {
    expect(computeGroupShares('shares', 100000, people([2, 1, 1])).shares.map((s) => s.amount)).toEqual([50000, 25000, 25000])
  })

  it('percent must reach 100%', () => {
    expect(computeGroupShares('percent', 100000, people([5000, 3000, 2000]))).toMatchObject({ error: null })
    expect(computeGroupShares('percent', 100000, people([5000, 3000])).error).toBe('20% left to assign')
    expect(computeGroupShares('percent', 100000, people([5000, 6000])).error).toBe('10% over 100%')
  })

  it('exact amounts must match the total', () => {
    expect(computeGroupShares('exact', 90000, people([40000, 30000, 20000])).error).toBeNull()
    expect(computeGroupShares('exact', 90000, people([40000, 30000])).error).toBe('₹200 left to assign')
    expect(computeGroupShares('exact', 90000, people([50000, 50000])).error).toBe('₹100 more than the total')
  })

  it('needs an amount and someone to share with', () => {
    expect(computeGroupShares('equal', 0, people([1])).error).toBe('Enter an amount')
    expect(computeGroupShares('equal', 100, people([0, 0])).error).toBe('Choose who shares this')
  })
})

describe('balances', () => {
  // A paid 900 split 3 ways; B paid 300 split between B and C.
  const expenses = [
    expense('dinner', 'A', 90000, [['A', 30000], ['B', 30000], ['C', 30000]]),
    expense('cab', 'B', 30000, [['B', 15000], ['C', 15000]], 2),
  ]

  it('nets add up to zero', () => {
    const nets = memberNets(expenses, [])
    expect(Object.fromEntries(nets)).toEqual({ A: 60000, B: -15000, C: -45000 })
    expect([...nets.values()].reduce((a, b) => a + b, 0)).toBe(0)
  })

  it('pairwise vs simplified', () => {
    expect(pairwiseDebts(expenses, [])).toEqual([
      { from: 'B', to: 'A', amount: 30000 },
      { from: 'C', to: 'A', amount: 30000 },
      { from: 'C', to: 'B', amount: 15000 },
    ])
    expect(simplifyDebts(memberNets(expenses, []))).toEqual([
      { from: 'C', to: 'A', amount: 45000 },
      { from: 'B', to: 'A', amount: 15000 },
    ])
  })

  it('simplify collapses a chain', () => {
    const chain = [expense('x', 'B', 10000, [['A', 10000]]), expense('y', 'C', 10000, [['B', 10000]])]
    expect(groupTransfers(true, chain, [])).toEqual([{ from: 'A', to: 'C', amount: 10000 }])
    expect(groupTransfers(false, chain, [])).toHaveLength(2)
  })

  it('payments reduce balances; disputed and deleted ones do not', () => {
    const settlements = [pay('p1', 'C', 'A', 30000), pay('p2', 'B', 'A', 99999, { status: 'disputed' }), pay('p3', 'B', 'A', 5, { deletedAt: 1 })]
    expect(Object.fromEntries(memberNets(expenses, settlements))).toEqual({ A: 30000, B: -15000, C: -15000 })
  })

  it('deleted expenses are ignored', () => {
    expect(memberNets([{ ...expenses[0], deletedAt: 5 }], []).size).toBe(0)
  })
})

describe('shareStatuses', () => {
  const dinner = expense('dinner', 'A', 90000, [['A', 30000], ['B', 30000], ['C', 30000]])

  it('pending → partial → paid → confirmed', () => {
    const st = (settlements: Settlement[]) => shareStatuses([dinner], settlements, false).get('dinner')!
    expect(st([]).map((s) => s.state)).toEqual(['payer', 'pending', 'pending'])

    const partial = st([pay('p', 'B', 'A', 10000, { expenseId: 'dinner' })])
    expect(partial[1]).toMatchObject({ state: 'partial', paid: 10000, remaining: 20000 })

    expect(st([pay('p', 'B', 'A', 30000, { expenseId: 'dinner' })])[1].state).toBe('paid')
    expect(st([pay('p', 'B', 'A', 30000, { expenseId: 'dinner', status: 'confirmed' })])[1].state).toBe('confirmed')
    expect(st([pay('p', 'B', 'A', 30000, { expenseId: 'dinner', status: 'disputed' })])[1].state).toBe('pending')
  })

  it('general settle-up fills the oldest shares first', () => {
    const later = expense('lunch', 'A', 20000, [['A', 10000], ['B', 10000]], 5)
    const map = shareStatuses([later, dinner], [pay('p', 'B', 'A', 35000, { status: 'confirmed' })], false)
    expect(map.get('dinner')![1]).toMatchObject({ state: 'confirmed', paid: 30000 })
    expect(map.get('lunch')![1]).toMatchObject({ state: 'partial', paid: 5000, remaining: 5000 })
  })

  it('with simplify, someone whose overall balance is clear shows as settled', () => {
    const back = expense('tickets', 'B', 60000, [['A', 30000], ['B', 30000]], 2)
    const map = shareStatuses([dinner, back], [], true)
    expect(map.get('dinner')![1]).toMatchObject({ state: 'paid', settledOverall: true })
    expect(map.get('dinner')![2]).toMatchObject({ state: 'pending' })
  })
})

describe('myRole', () => {
  it('lent and borrowed', () => {
    const e = expense('dinner', 'A', 90000, [['A', 30000], ['B', 30000], ['C', 30000]])
    expect(myRole(e, 'A')).toEqual({ paid: 90000, share: 30000, lent: 60000 })
    expect(myRole(e, 'B')).toEqual({ paid: 0, share: 30000, lent: -30000 })
    expect(myRole(e, 'Z')).toEqual({ paid: 0, share: 0, lent: 0 })
  })
})

describe('payment allocations', () => {
  it('say which payment paid off which share, oldest payment first', () => {
    const dinner = expense('dinner', 'A', 90000, [['A', 30000], ['B', 30000], ['C', 30000]], 1)
    const lunch = expense('lunch', 'A', 20000, [['A', 10000], ['B', 10000]], 5)
    const statuses = shareStatuses(
      [dinner, lunch],
      [pay('p2', 'B', 'A', 15000, { occurredAt: 20, status: 'confirmed' }), pay('p1', 'B', 'A', 20000, { occurredAt: 10 })],
      false,
    )
    expect(statuses.get('dinner')![1].coveredBy).toEqual([
      { settlementId: 'p1', amount: 20000 },
      { settlementId: 'p2', amount: 10000 },
    ])
    // p1 is still waiting for confirmation, so the dinner share is "paid", not "confirmed".
    expect(statuses.get('dinner')![1].state).toBe('paid')
    expect(statuses.get('lunch')![1]).toMatchObject({ state: 'partial', paid: 5000, coveredBy: [{ settlementId: 'p2', amount: 5000 }] })

    const byPayment = paymentAllocations(statuses)
    expect(byPayment.get('p1')).toEqual([{ expenseId: 'dinner', memberId: 'B', amount: 20000 }])
    expect(byPayment.get('p2')).toEqual([
      { expenseId: 'dinner', memberId: 'B', amount: 10000 },
      { expenseId: 'lunch', memberId: 'B', amount: 5000 },
    ])
  })

  it('balanced-out shares have no payment behind them', () => {
    const dinner = expense('dinner', 'A', 90000, [['A', 30000], ['B', 30000], ['C', 30000]], 1)
    const back = expense('tickets', 'B', 60000, [['A', 30000], ['B', 30000]], 2)
    const st = shareStatuses([dinner, back], [], true).get('dinner')![1]
    expect(st).toMatchObject({ settledOverall: true, coveredBy: [] })
  })
})

describe('pairLedger', () => {
  const bills = [
    expense('groceries', 'A', 90000, [['A', 30000], ['B', 30000], ['C', 30000]], 1),
    expense('wifi', 'B', 60000, [['A', 30000], ['B', 30000]], 2),
    expense('dinner', 'A', 120000, [['A', 40000], ['B', 40000], ['C', 40000]], 3),
    expense('cab', 'C', 30000, [['B', 15000], ['C', 15000]], 4),
    { ...expense('old', 'A', 50000, [['A', 25000], ['B', 25000]], 5), deletedAt: 9 },
    {
      ...expense('trip', 'A', 90000, [['A', 30000], ['B', 30000], ['C', 30000]], 6),
      payers: [
        { memberId: 'A', amount: 60000 },
        { memberId: 'C', amount: 30000 },
      ],
    },
  ]
  const payments = [
    pay('p1', 'B', 'A', 20000, { occurredAt: 7, status: 'confirmed' }),
    pay('p2', 'B', 'A', 99900, { occurredAt: 8, status: 'disputed' }),
    pay('p3', 'A', 'C', 5000, { occurredAt: 8 }),
  ]

  it('explains the direct balance line by line', () => {
    const ledger = pairLedger(bills, payments, 'A', 'B')
    expect(ledger.rows.map((r) => [r.id, r.delta, r.running, r.counts])).toEqual([
      ['groceries', 30000, 30000, true],
      ['wifi', -30000, 0, true],
      ['dinner', 40000, 40000, true],
      ['old', 0, 40000, false],
      ['trip', 20000, 60000, true],
      ['p1', -20000, 40000, true],
      ['p2', 0, 40000, false],
    ])
    expect(ledger.otherBills).toBe(1) // the cab didn't involve A and B
    expect(ledger.balance).toBe(40000)
  })

  it('always ends at the direct balance, for every pair', () => {
    const direct = pairwiseDebts(bills, payments)
    for (const [a, b] of [
      ['A', 'B'],
      ['B', 'A'],
      ['A', 'C'],
      ['C', 'B'],
    ]) {
      const t = direct.find((d) => (d.from === a && d.to === b) || (d.from === b && d.to === a))
      const expected = !t ? 0 : t.from === b ? t.amount : -t.amount
      expect(pairLedger(bills, payments, a, b).balance).toBe(expected)
    }
  })
})

describe('netBreakdown', () => {
  it('adds up to the member net', () => {
    const bills = [expense('dinner', 'A', 90000, [['A', 30000], ['B', 30000], ['C', 30000]]), expense('cab', 'B', 20000, [['A', 10000], ['B', 10000]])]
    const payments = [pay('p', 'B', 'A', 5000), pay('x', 'C', 'A', 1000, { deletedAt: 3 })]
    const nets = memberNets(bills, payments)
    for (const m of ['A', 'B', 'C']) expect(netBreakdown(bills, payments, m).net).toBe(nets.get(m) ?? 0)
    expect(netBreakdown(bills, payments, 'B')).toEqual({ paid: 20000, share: 40000, sent: 5000, received: 0, net: -15000 })
  })
})

describe('payment rules', () => {
  it('only the receiver confirms; the recorder or receiver manages', () => {
    const p = pay('p', 'B', 'A', 100, { createdBy: 'C' })
    expect(canConfirmPayment(p, 'A')).toBe(true)
    expect(canConfirmPayment(p, 'B')).toBe(false)
    expect(canConfirmPayment(p, 'C')).toBe(false)
    expect(canManagePayment(p, 'A')).toBe(true)
    expect(canManagePayment(p, 'C')).toBe(true)
    expect(canManagePayment(p, 'B')).toBe(false)
    // Older payments without a recorder: either side.
    const old = pay('o', 'B', 'A', 100)
    expect(canManagePayment(old, 'B')).toBe(true)
    expect(canManagePayment(old, 'C')).toBe(false)
  })
})
