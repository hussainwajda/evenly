import { beforeEach, describe, expect, it } from 'vitest'
import { balancesByPerson } from '@/lib/ledger'
import { countBackupRecords, exportBackup, mergeBackup, parseBackup, restoreBackup, transactionsCsv } from './backup'
import { db } from './index'
import {
  addRecurringForMonth,
  deleteExpense,
  dueRecurring,
  getEffectiveBudget,
  getOrCreatePerson,
  getSettings,
  learnedCategory,
  nameSuggestions,
  restoreExpense,
  saveExpense,
  saveLedgerEntry,
  saveRecurring,
  setBudget,
  updateSettings,
} from './repo'

beforeEach(async () => {
  await db.delete()
  await db.open()
})

const at = (day: number) => new Date(2026, 8, day, 12).getTime()

describe('seed', () => {
  it('populates categories, payment methods and settings', async () => {
    expect(await db.categories.count()).toBe(13)
    expect((await db.paymentMethods.get('upi-navi'))?.label).toBe('UPI · Navi')
    expect(await getSettings()).toMatchObject({ defaultPaymentMethodId: 'upi-navi', theme: 'dark', monthStartDay: 1 })
  })
})

describe('expenses', () => {
  it('split bill creates receivables; editing replaces them; delete/restore cascades', async () => {
    const a = await getOrCreatePerson('Hussain')
    const b = await getOrCreatePerson('Patil')
    const id = await saveExpense({
      name: 'Dmart contri',
      amount: 18534,
      categoryId: 'groceries',
      paymentMethodId: 'upi-navi',
      occurredAt: at(5),
      shares: [
        { personId: a, amount: 18533 },
        { personId: b, amount: 18533 },
      ],
    })
    const txn = await db.transactions.get(id)
    expect(txn).toMatchObject({ grossAmount: 55600, nameLower: 'dmart contri' })
    expect(Object.fromEntries(balancesByPerson(await db.ledger.toArray()))).toEqual({ [a]: 18533, [b]: 18533 })

    await saveExpense({ name: 'Dmart contri', amount: 27800, categoryId: 'groceries', paymentMethodId: 'upi-navi', occurredAt: at(5), shares: [{ personId: a, amount: 27800 }] }, id)
    const ledger = await db.ledger.toArray()
    expect(ledger).toHaveLength(1)
    expect(Object.fromEntries(balancesByPerson(ledger))).toEqual({ [a]: 27800 })

    await deleteExpense(id)
    expect((await db.transactions.get(id))?.deletedAt).toBeTypeOf('number')
    expect(balancesByPerson(await db.ledger.toArray()).size).toBe(0)

    await restoreExpense(id)
    expect(Object.fromEntries(balancesByPerson(await db.ledger.toArray()))).toEqual({ [a]: 27800 })
  })

  it('friend paid for me → borrowed, no payment method', async () => {
    const p = await getOrCreatePerson('patil')
    const id = await saveExpense({ name: 'Movie', amount: 30000, categoryId: 'entertainment', paymentMethodId: 'upi-navi', occurredAt: at(6), paidByPersonId: p, shares: [{ personId: 'x', amount: 5 }] })
    expect(await db.transactions.get(id)).toMatchObject({ paymentMethodId: null, shares: [] })
    expect(balancesByPerson(await db.ledger.toArray()).get(p)).toBe(-30000)
  })

  it('getOrCreatePerson is case-insensitive', async () => {
    expect(await getOrCreatePerson('Mummy')).toBe(await getOrCreatePerson('  mummy '))
    expect(await db.people.count()).toBe(1)
  })

  it('name suggestions and learned category', async () => {
    await saveExpense({ name: 'Chai', amount: 1000, categoryId: 'food', paymentMethodId: 'cash', occurredAt: at(1) })
    await saveExpense({ name: 'chai', amount: 1200, categoryId: 'food', paymentMethodId: 'upi-navi', occurredAt: at(2) })
    await saveExpense({ name: 'Chaat', amount: 4000, categoryId: 'food', paymentMethodId: 'upi-navi', occurredAt: at(3) })
    const s = await nameSuggestions('cha')
    expect(s[0]).toMatchObject({ name: 'chai', amount: 1200, count: 2, paymentMethodId: 'upi-navi' })
    expect(s).toHaveLength(2)
    expect(await learnedCategory('CHAI')).toBe('food')
    expect(await learnedCategory('unknown')).toBeNull()
  })
})

describe('budgets', () => {
  it('falls back to the latest earlier budget', async () => {
    await setBudget('2026-07', 1500000, { food: 300000, bills: 0 })
    await setBudget('2026-08', 1600000)
    expect(await getEffectiveBudget('2026-08')).toMatchObject({ total: 1600000, inherited: false })
    expect(await getEffectiveBudget('2026-10')).toMatchObject({ total: 1600000, inherited: true })
    expect(await getEffectiveBudget('2026-06')).toBeNull()
    expect((await db.budgets.get('2026-07'))?.perCategory).toEqual({ food: 300000 })
  })
})

describe('recurring', () => {
  it('is due near its day, adds once per month', async () => {
    const id = await saveRecurring({ name: 'Rent', amount: 525000, categoryId: 'home', paymentMethodId: null, dayOfMonth: 1, active: true })
    const rec = (await db.recurring.get(id))!
    expect(dueRecurring([rec], '2026-09', at(15))).toHaveLength(1)
    await addRecurringForMonth(rec, '2026-09', 'upi-navi')
    const updated = (await db.recurring.get(id))!
    expect(dueRecurring([updated], '2026-09', at(15))).toHaveLength(0)
    const txns = await db.transactions.toArray()
    expect(txns[0]).toMatchObject({ name: 'Rent', source: 'recurring', paymentMethodId: 'upi-navi', recurringId: id })
  })
})

describe('backup', () => {
  it('round-trips all data and rejects foreign files', async () => {
    const p = await getOrCreatePerson('Mummy')
    await saveLedgerEntry({ personId: p, type: 'lent', amount: 450000, occurredAt: at(8) })
    await saveExpense({ name: 'Chai, "special"', amount: 1200, categoryId: 'food', paymentMethodId: 'upi-navi', occurredAt: at(1) })
    await updateSettings({ monthStartDay: 5 })
    const file = await exportBackup()
    const text = JSON.stringify(file)

    await db.delete()
    await db.open()
    expect(await db.transactions.count()).toBe(0)

    await restoreBackup(parseBackup(text))
    expect(await db.transactions.count()).toBe(1)
    expect(await db.ledger.count()).toBe(1)
    expect((await getSettings()).monthStartDay).toBe(5)

    expect(() => parseBackup('{"hello":1}')).toThrow(/not an Evenly backup/)
    expect(() => parseBackup('nope')).toThrow(/not valid JSON/)

    const csv = await transactionsCsv()
    expect(csv.split('\r\n')[1]).toContain('"Chai, ""special"""')
  })

  it('merges a partial data file without removing existing data, and re-merging adds no duplicates', async () => {
    await saveExpense({ name: 'Existing', amount: 100, categoryId: 'food', paymentMethodId: 'cash', occurredAt: at(1) })
    const file = parseBackup(
      JSON.stringify({
        format: 'kharcha-backup',
        version: 1,
        exportedAt: 1,
        data: {
          transactions: [
            {
              id: 'sep-rent', name: 'Rent', nameLower: 'rent', amount: 525000, grossAmount: 525000, categoryId: 'home',
              paymentMethodId: 'upi-navi', occurredAt: at(1), note: '', tags: [], source: 'import', excludeFromSpend: false,
              paidByPersonId: null, shares: [], recurringId: null, importBatchId: 'b1', createdAt: 1, updatedAt: 1, deletedAt: null,
            },
          ],
          recurring: [
            { id: 'rec-rent', name: 'Rent', amount: 525000, categoryId: 'home', paymentMethodId: 'upi-navi', dayOfMonth: 1, active: true, lastAddedMonthKey: '2026-09', createdAt: 1 },
          ],
        },
      }),
    )
    expect(countBackupRecords(file)).toBe(2)
    expect(await mergeBackup(file)).toBe(2)
    await mergeBackup(file)
    expect(await db.transactions.count()).toBe(2)
    expect(await db.recurring.count()).toBe(1)
    expect(await db.categories.count()).toBe(13)
  })
})
