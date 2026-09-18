/**
 * Offline-first sync between the local Dexie database and a remote store.
 *  push: send queued local changes (outbox), then drop the entries that didn't change meanwhile.
 *  pull: fetch remote changes since the last revision and apply them, unless a newer local change is pending.
 */
import { ALL_TABLES, DEFAULT_PAYMENT_METHODS, defaultCategories, defaultSettings, type KharchaDB } from '@/db'
import { markRemote, type OutboxEntry } from '@/db/syncMiddleware'
import type { RemoteRecordIn, SyncRemote } from './types'

const PUSH_BATCH = 200
const PULL_PAGE = 500
const SYNCED = new Set<string>(ALL_TABLES)
/** Tables seeded with identical defaults on every device — their local copy never beats the cloud on first link. */
const CONFIG_TABLES = new Set<string>(['settings', 'categories', 'paymentMethods'])

export async function getSyncState<T>(db: KharchaDB, key: string, fallback: T): Promise<T> {
  const row = await db.syncState.get(key)
  return row ? (row.value as T) : fallback
}

export async function setSyncState(db: KharchaDB, key: string, value: unknown): Promise<void> {
  await db.syncState.put({ key, value })
}

export async function pushChanges(db: KharchaDB, remote: SyncRemote): Promise<number> {
  let pushed = 0
  for (;;) {
    const entries = await db.syncOutbox.orderBy('updatedAt').limit(PUSH_BATCH).toArray()
    if (!entries.length) break

    const records: RemoteRecordIn[] = []
    for (const e of entries) {
      const row = e.op === 'put' ? await db.table(e.table).get(e.id) : undefined
      records.push({
        table_name: e.table,
        id: e.id,
        data: row ?? null,
        deleted: row === undefined,
        client_updated_at: e.updatedAt,
      })
    }

    await remote.push(records)

    // Only clear entries that weren't changed again while we were uploading.
    await db.transaction('rw', db.syncOutbox, async () => {
      for (const e of entries) {
        const current = await db.syncOutbox.get([e.table, e.id])
        if (current && current.updatedAt === e.updatedAt && current.op === e.op) {
          await db.syncOutbox.delete([e.table, e.id])
        }
      }
    })

    pushed += entries.length
    if (entries.length < PUSH_BATCH) break
  }
  return pushed
}

export async function pullChanges(db: KharchaDB, remote: SyncRemote): Promise<number> {
  let since = await getSyncState<number>(db, 'lastRev', 0)
  let applied = 0
  const tables = [...ALL_TABLES.map((n) => db.table(n)), db.syncOutbox, db.syncState]

  for (;;) {
    const page = await remote.pull(since, PULL_PAGE)
    if (!page.length) break

    await db.transaction('rw', tables, async (tx) => {
      markRemote(tx)
      for (const rec of page) {
        since = Math.max(since, rec.rev)
        if (!SYNCED.has(rec.table_name)) continue
        const pending = await db.syncOutbox.get([rec.table_name, rec.id])
        if (pending && pending.updatedAt > rec.client_updated_at) continue // our newer change will be pushed

        if (rec.deleted || rec.data == null) await db.table(rec.table_name).delete(rec.id)
        else await db.table(rec.table_name).put(rec.data)
        if (pending) await db.syncOutbox.delete([rec.table_name, rec.id])
        applied++
      }
      await db.syncState.put({ key: 'lastRev', value: since })
    })

    if (page.length < PULL_PAGE) break
  }
  return applied
}

export async function syncOnce(db: KharchaDB, remote: SyncRemote): Promise<{ pushed: number; pulled: number }> {
  const pushed = await pushChanges(db, remote)
  const pulled = await pullChanges(db, remote)
  await setSyncState(db, 'lastSyncedAt', Date.now())
  return { pushed, pulled }
}

function rowChangeTime(table: string, row: Record<string, unknown>): number {
  if (CONFIG_TABLES.has(table)) return 1
  const times = [row.updatedAt, row.createdAt, row.deletedAt].filter((t): t is number => typeof t === 'number')
  return times.length ? Math.max(...times) : 1
}

/**
 * Queue everything already on this device — used the first time a device is linked to an account,
 * so data created before signing in gets uploaded. Existing (newer) outbox entries are kept.
 */
export async function enqueueAllLocal(db: KharchaDB): Promise<number> {
  let queued = 0
  await db.transaction('rw', [...ALL_TABLES.map((n) => db.table(n)), db.syncOutbox], async (tx) => {
    markRemote(tx)
    for (const name of ALL_TABLES) {
      const table = db.table(name)
      const keyPath = table.schema.primKey.keyPath as string
      const rows = (await table.toArray()) as Record<string, unknown>[]
      for (const row of rows) {
        if (row.groupExpenseId) continue // my share of a group expense — rebuilt from group data, never uploaded
        const id = String(row[keyPath])
        if (await db.syncOutbox.get([name, id])) continue
        await db.syncOutbox.put({ table: name, id, op: 'put', updatedAt: rowChangeTime(name, row) } satisfies OutboxEntry)
        queued++
      }
    }
  })
  return queued
}

/** Wipe local data (e.g. switching Google accounts) and restore the defaults, without queuing anything. */
export async function clearLocalData(db: KharchaDB): Promise<void> {
  const groupTables = [db.groups, db.groupMembers, db.groupExpenses, db.groupSettlements, db.groupOutbox, db.groupSyncState]
  await db.transaction('rw', [...ALL_TABLES.map((n) => db.table(n)), db.syncOutbox, db.syncState, ...groupTables], async (tx) => {
    markRemote(tx)
    for (const name of ALL_TABLES) await db.table(name).clear()
    for (const table of groupTables) await table.clear()
    await db.syncOutbox.clear()
    await db.syncState.clear()
    await db.settings.add(defaultSettings())
    await db.categories.bulkAdd(defaultCategories())
    await db.paymentMethods.bulkAdd(DEFAULT_PAYMENT_METHODS)
  })
}
