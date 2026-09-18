import { formatShortDate, formatTime } from '@/lib/dates'
import { ALL_TABLES, db, type TableName } from './index'

export const BACKUP_FORMAT = 'kharcha-backup'
export const BACKUP_VERSION = 1

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: number
  /** A full backup has every table; a data file (e.g. prepared expenses) may carry only some. */
  data: Partial<Record<TableName, unknown[]>>
}

export function countBackupRecords(file: BackupFile): number {
  return Object.values(file.data).reduce((a, rows) => a + (rows?.length ?? 0), 0)
}

/** Adds or updates (by id) every record in the file, keeping everything already on this device. */
export async function mergeBackup(file: BackupFile): Promise<number> {
  const present = ALL_TABLES.filter((n) => (file.data[n]?.length ?? 0) > 0)
  if (!present.length) return 0
  let count = 0
  await db.transaction(
    'rw',
    present.map((n) => db.table(n)),
    async () => {
      for (const name of present) {
        const rows = file.data[name] ?? []
        await db.table(name).bulkPut(rows)
        count += rows.length
      }
    },
  )
  return count
}

export async function exportBackup(): Promise<BackupFile> {
  const data = {} as Record<TableName, unknown[]>
  for (const name of ALL_TABLES) data[name] = await db.table(name).toArray()
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: Date.now(), data }
}

export function parseBackup(text: string): BackupFile {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('This file is not valid JSON.')
  }
  const file = json as Partial<BackupFile>
  if (!file || file.format !== BACKUP_FORMAT) throw new Error('This is not an Evenly backup file.')
  if (typeof file.version !== 'number' || file.version > BACKUP_VERSION) {
    throw new Error('This backup was made by a newer version of Evenly.')
  }
  if (!file.data || typeof file.data !== 'object') throw new Error('The backup file has no data.')
  for (const name of ALL_TABLES) {
    const rows = (file.data as Record<string, unknown>)[name]
    if (rows !== undefined && !Array.isArray(rows)) throw new Error(`Backup table "${name}" is malformed.`)
  }
  return file as BackupFile
}

/** Replaces all app data with the backup's contents, atomically. */
export async function restoreBackup(file: BackupFile): Promise<void> {
  const tables = ALL_TABLES.map((n) => db.table(n))
  await db.transaction('rw', tables, async () => {
    for (const name of ALL_TABLES) {
      await db.table(name).clear()
      const rows = file.data[name] ?? []
      if (rows.length) await db.table(name).bulkPut(rows)
    }
  })
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function transactionsCsv(): Promise<string> {
  const [txns, cats, pms, people] = await Promise.all([
    db.transactions.orderBy('occurredAt').toArray(),
    db.categories.toArray(),
    db.paymentMethods.toArray(),
    db.people.toArray(),
  ])
  const cat = new Map(cats.map((c) => [c.id, c.name]))
  const pm = new Map(pms.map((p) => [p.id, p.label]))
  const person = new Map(people.map((p) => [p.id, p.name]))

  const header = ['Date', 'Time', 'Name', 'My share (₹)', 'Bill total (₹)', 'Category', 'Payment method', 'Paid by', 'Split with', 'Excluded from spend', 'Note', 'Tags']
  const lines = [header.map(csvCell).join(',')]
  for (const t of txns) {
    if (t.deletedAt) continue
    lines.push(
      [
        formatShortDate(t.occurredAt),
        formatTime(t.occurredAt),
        t.name,
        (t.amount / 100).toFixed(2),
        (t.grossAmount / 100).toFixed(2),
        cat.get(t.categoryId) ?? t.categoryId,
        t.paymentMethodId ? (pm.get(t.paymentMethodId) ?? '') : '',
        t.paidByPersonId ? (person.get(t.paidByPersonId) ?? '') : '',
        t.shares.map((s) => `${person.get(s.personId) ?? '?'} ₹${(s.amount / 100).toFixed(2)}`).join('; '),
        t.excludeFromSpend ? 'yes' : '',
        t.note,
        t.tags.join(' '),
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return lines.join('\r\n')
}
