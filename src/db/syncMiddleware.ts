/**
 * Dexie DBCore middleware that records every local change to synced tables in the `syncOutbox` table,
 * inside the same IndexedDB transaction — so a change can never be saved without also being queued for sync.
 *
 * Writes made while applying cloud changes (or seeding defaults) are marked with `markRemote(tx)` and skipped.
 */
import type { DBCore, DBCoreTransaction, Middleware } from 'dexie'

export const OUTBOX = 'syncOutbox'
const REMOTE_FLAG = '__kharchaRemote'

export interface OutboxEntry {
  table: string
  id: string
  op: 'put' | 'delete'
  /** Device time of the change (epoch ms) — used for last-write-wins. */
  updatedAt: number
}

/** Mark a Dexie transaction so its writes are not queued for upload. */
export function markRemote(tx: { idbtrans: IDBTransaction }): void {
  ;(tx.idbtrans as unknown as Record<string, boolean>)[REMOTE_FLAG] = true
}

function isRemote(trans: DBCoreTransaction): boolean {
  return Boolean((trans as unknown as Record<string, boolean>)[REMOTE_FLAG])
}

export function createSyncMiddleware(syncedTables: readonly string[], now: () => number = () => Date.now()): Middleware<DBCore> {
  const synced = new Set(syncedTables)

  return {
    stack: 'dbcore',
    name: 'kharchaSyncOutbox',
    create(down) {
      // While Dexie upgrades an older database (e.g. v1 → v2) the core reflects the old schema,
      // which has no outbox yet. Never touch the outbox unless it exists.
      const hasOutbox = down.schema.tables.some((t) => t.name === OUTBOX)

      return {
        ...down,
        transaction(stores, mode, options) {
          const needsOutbox = hasOutbox && mode === 'readwrite' && !stores.includes(OUTBOX) && stores.some((s) => synced.has(s))
          return down.transaction(needsOutbox ? [...stores, OUTBOX] : stores, mode, options)
        },
        table(name) {
          const table = down.table(name)
          if (!synced.has(name) || !hasOutbox) return table

          return {
            ...table,
            async mutate(req) {
              if (isRemote(req.trans)) return table.mutate(req)
              const outbox = down.table(OUTBOX)

              // A range delete (e.g. table.clear()) doesn't list keys, so look them up first.
              let rangeKeys: unknown[] = []
              if (req.type === 'deleteRange') {
                const found = await table.query({
                  trans: req.trans,
                  values: false,
                  query: { index: table.schema.primaryKey, range: req.range },
                })
                rangeKeys = found.result
              }

              const res = await table.mutate(req)

              let keys: unknown[]
              let op: OutboxEntry['op']
              if (req.type === 'add' || req.type === 'put') {
                op = 'put'
                keys = (res.results ?? req.keys ?? []).filter((_, i) => !res.failures[i])
              } else if (req.type === 'delete') {
                op = 'delete'
                keys = req.keys.filter((_, i) => !res.failures[i])
              } else {
                op = 'delete'
                keys = rangeKeys
              }

              if (keys.length) {
                const updatedAt = now()
                await outbox.mutate({
                  type: 'put',
                  trans: req.trans,
                  values: keys.map((k) => ({ table: name, id: String(k), op, updatedAt }) satisfies OutboxEntry),
                })
              }
              return res
            },
          }
        },
      }
    },
  }
}
