import { beforeEach, describe, expect, it } from 'vitest'
import { balancesByPerson } from '@/lib/ledger'
import { commitImport, importDate, removeImportBatch } from './importCommit'
import { db } from './index'
import { getOrCreatePerson } from './repo'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('importDate', () => {
  it('uses noon and clamps the day', () => {
    expect(new Date(importDate('2024-02', 31))).toEqual(new Date(2024, 1, 29, 12))
    expect(new Date(importDate('2023-11', null))).toEqual(new Date(2023, 10, 1, 12))
  })
})

describe('commitImport', () => {
  it('creates expenses, excluded deals and ledger entries; reuses people; undo removes all', async () => {
    const existing = await getOrCreatePerson('Hussain')
    const r = await commitImport('monthly expenses.xlsx', [
      { monthKey: '2024-11', day: 1, name: 'Chai', amount: 1200, categoryId: 'food', action: 'expense' },
      { monthKey: '2024-11', day: 2, name: 'Trunk', amount: 9900, categoryId: 'shopping', action: 'exclude' },
      { monthKey: '2025-04', day: null, name: 'hussain', amount: 1810000, categoryId: 'misc', action: 'borrowed', personName: 'hussain' },
      { monthKey: '2025-04', day: null, name: 'patil', amount: 1200000, categoryId: 'misc', action: 'borrowed', personName: 'Patil' },
      { monthKey: '2025-04', day: 3, name: 'cng', amount: 0, categoryId: 'transport', action: 'expense' },
      { monthKey: '2025-04', day: 3, name: 'skip me', amount: 500, categoryId: 'misc', action: 'skip' },
    ])
    expect(r).toMatchObject({ transactions: 2, ledger: 2 })

    const txns = await db.transactions.orderBy('nameLower').toArray()
    expect(txns.map((t) => [t.name, t.excludeFromSpend, t.source])).toEqual([
      ['Chai', false, 'import'],
      ['Trunk', true, 'import'],
    ])
    expect(await db.people.count()).toBe(2)
    const balances = balancesByPerson(await db.ledger.toArray())
    expect(balances.get(existing)).toBe(-1810000)

    await removeImportBatch(r.batchId)
    expect(await db.transactions.count()).toBe(0)
    expect(await db.ledger.count()).toBe(0)
    expect(await db.importBatches.count()).toBe(0)
  })
})
