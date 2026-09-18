import { daysInMonth, parseMonthKey } from '@/lib/dates'
import type { LedgerEntry, LedgerType, Transaction } from '@/lib/types'
import { uid } from '@/lib/utils'
import { db } from './index'
import { lowerName } from './repo'

export type ReviewAction = 'skip' | 'expense' | 'exclude' | LedgerType

export interface ImportRow {
  monthKey: string
  day: number | null
  name: string
  /** paise */
  amount: number
  categoryId: string
  action: ReviewAction
  personName?: string
}

/** Noon on the given day (clamped to the month), so time zones never push it into another day. */
export function importDate(monthKey: string, day: number | null): number {
  const { year, monthIndex } = parseMonthKey(monthKey)
  const d = Math.min(Math.max(day ?? 1, 1), daysInMonth(year, monthIndex))
  return new Date(year, monthIndex, d, 12, 0).getTime()
}

export async function commitImport(
  fileName: string,
  rows: ImportRow[],
): Promise<{ batchId: string; transactions: number; ledger: number }> {
  const batchId = uid()
  const now = Date.now()

  return db.transaction('rw', [db.transactions, db.ledger, db.people, db.importBatches], async () => {
    const people = await db.people.toArray()
    const personIdByName = new Map(people.map((p) => [p.nameLower, p.id]))
    const txns: Transaction[] = []
    const ledger: LedgerEntry[] = []

    for (const row of rows) {
      if (row.action === 'skip' || row.amount <= 0) continue
      const occurredAt = importDate(row.monthKey, row.day)

      if (row.action === 'expense' || row.action === 'exclude') {
        txns.push({
          id: uid(),
          name: row.name,
          nameLower: lowerName(row.name),
          amount: row.amount,
          grossAmount: row.amount,
          categoryId: row.categoryId,
          paymentMethodId: null,
          occurredAt,
          note: '',
          tags: [],
          source: 'import',
          excludeFromSpend: row.action === 'exclude',
          paidByPersonId: null,
          shares: [],
          recurringId: null,
          importBatchId: batchId,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        })
        continue
      }

      const personName = (row.personName || row.name).trim()
      const key = lowerName(personName)
      let personId = personIdByName.get(key)
      if (!personId) {
        personId = uid()
        personIdByName.set(key, personId)
        await db.people.add({ id: personId, name: personName, nameLower: key, phone: '', note: '', archived: false, createdAt: now })
      }
      ledger.push({
        id: uid(),
        personId,
        type: row.action,
        amount: row.amount,
        occurredAt,
        note: `Imported: ${row.name}`,
        paymentMethodId: null,
        transactionId: null,
        importBatchId: batchId,
        createdAt: now,
        deletedAt: null,
      })
    }

    if (txns.length) await db.transactions.bulkAdd(txns)
    if (ledger.length) await db.ledger.bulkAdd(ledger)
    await db.importBatches.add({ id: batchId, fileName, createdAt: now, transactionCount: txns.length, ledgerCount: ledger.length })
    return { batchId, transactions: txns.length, ledger: ledger.length }
  })
}

/** Removes everything a single import created (people it created are kept). */
export async function removeImportBatch(batchId: string): Promise<void> {
  await db.transaction('rw', [db.transactions, db.ledger, db.importBatches], async () => {
    await db.transactions.where('importBatchId').equals(batchId).delete()
    await db.ledger.where('importBatchId').equals(batchId).delete()
    await db.importBatches.delete(batchId)
  })
}
