import { describe, expect, it } from 'vitest'
import { pairLedger } from './groupMath'
import type { GroupExpense, Settlement } from './groupTypes'
import { balanceSentence, statementCsv, statementText } from './groupStatement'

const bill = (id: string, payer: string, amount: number, shares: [string, number][], occurredAt: number): GroupExpense => ({
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

const names: Record<string, string> = { A: 'Aadit', B: 'Rahul' }
const name = (m: string | null | undefined) => (m ? (names[m] ?? 'Someone') : 'Someone')

describe('statement text', () => {
  const expenses = [bill('Groceries', 'A', 90000, [['A', 45000], ['B', 45000]], new Date(2026, 8, 3).getTime())]
  const payments: Settlement[] = [
    {
      id: 'p', groupId: 'g', from: 'B', to: 'A', amount: 20000, method: 'upi', occurredAt: new Date(2026, 8, 5).getTime(), note: '',
      expenseId: null, status: 'confirmed', updatedAt: 1, deletedAt: null,
    },
  ]
  const ledger = pairLedger(expenses, payments, 'A', 'B')

  it('reads line by line and ends with the balance', () => {
    const text = statementText({ ledger, rows: ledger.rows, a: 'A', b: 'B', name, groupName: 'Flat 402', scope: 'all time' })
    expect(text).toContain('Groceries (₹900, paid by Aadit): Rahul owes Aadit ₹450 → +₹450')
    expect(text).toContain('Payment: Rahul paid Aadit ₹200 (UPI) → −₹200 [confirmed]')
    expect(text).toContain('Balance: Rahul owes Aadit ₹250')
  })

  it('CSV has one row per item', () => {
    const csv = statementCsv({ rows: ledger.rows, a: 'A', b: 'B', name }).split('\n')
    expect(csv).toHaveLength(3)
    expect(csv[1]).toContain('Bill,Groceries,900,Aadit')
    expect(csv[2].endsWith(',yes,-200,250')).toBe(true)
  })

  it('balance sentences', () => {
    expect(balanceSentence(0, 'A', 'B', name)).toBe('All settled')
    expect(balanceSentence(-500, 'A', 'B', name)).toBe('Aadit owes Rahul ₹5')
  })
})
