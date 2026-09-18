import { describe, expect, it } from 'vitest'
import { balancesByPerson, ledgerEntriesForTransaction, ledgerTotals, personBalance } from './ledger'
import type { LedgerType } from './types'

const e = (personId: string, type: LedgerType, amount: number, deletedAt: number | null = null) => ({
  personId,
  type,
  amount,
  deletedAt,
})

describe('ledger balances', () => {
  it('lend then receive back settles to zero', () => {
    expect(personBalance([e('a', 'lent', 50000), e('a', 'received', 50000)])).toBe(0)
  })

  it('borrow then repay settles to zero', () => {
    expect(personBalance([e('a', 'borrowed', 100000), e('a', 'repaid', 100000)])).toBe(0)
  })

  it('ignores deleted entries', () => {
    expect(personBalance([e('a', 'lent', 50000), e('a', 'lent', 999, 1)])).toBe(50000)
  })

  it('aggregates per person and totals', () => {
    const map = balancesByPerson([
      e('mummy', 'lent', 450000),
      e('hussain', 'borrowed', 1810000),
      e('hussain', 'repaid', 1000000),
      e('patil', 'lent', 20000),
    ])
    expect(map.get('mummy')).toBe(450000)
    expect(map.get('hussain')).toBe(-810000)
    expect(ledgerTotals(map.values())).toEqual({ owedToMe: 470000, iOwe: 810000, net: -340000 })
  })
})

describe('ledgerEntriesForTransaction', () => {
  const base = { name: 'Dinner', occurredAt: 1, paymentMethodId: 'upi-navi' }

  it('split bill I paid → others owe their shares', () => {
    const entries = ledgerEntriesForTransaction({
      ...base,
      amount: 18534,
      paidByPersonId: null,
      shares: [
        { personId: 'a', amount: 18533 },
        { personId: 'b', amount: 18533 },
      ],
    })
    expect(entries.map((x) => [x.personId, x.type, x.amount])).toEqual([
      ['a', 'lent', 18533],
      ['b', 'lent', 18533],
    ])
  })

  it('paid on behalf (my share 0) → full amount lent', () => {
    const entries = ledgerEntriesForTransaction({
      ...base,
      amount: 0,
      paidByPersonId: null,
      shares: [{ personId: 'hussain', amount: 30000 }],
    })
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ personId: 'hussain', type: 'lent', amount: 30000 })
  })

  it('friend paid for me → I borrowed my share', () => {
    const entries = ledgerEntriesForTransaction({ ...base, amount: 20000, paidByPersonId: 'patil', shares: [] })
    expect(entries).toEqual([expect.objectContaining({ personId: 'patil', type: 'borrowed', amount: 20000, paymentMethodId: null })])
  })

  it('plain expense → no entries', () => {
    expect(ledgerEntriesForTransaction({ ...base, amount: 1200, paidByPersonId: null, shares: [] })).toEqual([])
  })
})
