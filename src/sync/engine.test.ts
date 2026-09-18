import Dexie, { liveQuery } from 'dexie'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KharchaDB } from '@/db'
import { markRemote } from '@/db/syncMiddleware'
import type { LedgerEntry, Recurring, Transaction } from '@/lib/types'
import { clearLocalData, enqueueAllLocal, getSyncState, pullChanges, syncOnce } from './engine'
import type { RemoteRecord, RemoteRecordIn, SyncRemote } from './types'

/** In-memory stand-in for the Supabase table + kharcha_push function. */
class FakeRemote implements SyncRemote {
  rows = new Map<string, RemoteRecord>()
  rev = 0
  async push(records: RemoteRecordIn[]) {
    for (const r of records) {
      const key = `${r.table_name}:${r.id}`
      const cur = this.rows.get(key)
      if (cur && r.client_updated_at < cur.client_updated_at) continue
      this.rows.set(key, { ...structuredClone(r), data: r.deleted ? null : structuredClone(r.data), rev: ++this.rev })
    }
  }
  async pull(since: number, limit: number) {
    return [...this.rows.values()]
      .filter((r) => r.rev > since)
      .sort((a, b) => a.rev - b.rev)
      .slice(0, limit)
      .map((r) => structuredClone(r))
  }
}

let dbCount = 0
async function newDevice() {
  const d = new KharchaDB(`sync-test-${++dbCount}`)
  await d.open()
  return d
}

function txn(id: string, name: string, amount: number, extra: Partial<Transaction> = {}): Transaction {
  return {
    id,
    name,
    nameLower: name.toLowerCase(),
    amount,
    grossAmount: amount,
    categoryId: 'food',
    paymentMethodId: 'upi-navi',
    occurredAt: 1_790_000_000_000,
    note: '',
    tags: [],
    source: 'manual',
    excludeFromSpend: false,
    paidByPersonId: null,
    shares: [],
    recurringId: null,
    importBatchId: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...extra,
  }
}

function ledger(id: string, transactionId: string): LedgerEntry {
  return { id, personId: 'p1', type: 'lent', amount: 100, occurredAt: 1, note: '', paymentMethodId: null, transactionId, importBatchId: null, createdAt: 1, deletedAt: null }
}

const outboxMap = async (d: KharchaDB) => Object.fromEntries((await d.syncOutbox.toArray()).map((e) => [`${e.table}:${e.id}`, e.op]))

afterEach(() => {
  vi.useRealTimers()
})

describe('sync outbox middleware', () => {
  it('upgrades an existing v1 database: keeps data, adds the outbox, then queues new writes', async () => {
    const name = `upgrade-test-${++dbCount}`
    const v1 = new Dexie(name)
    v1.version(1).stores({
      settings: 'id',
      categories: 'id, order',
      paymentMethods: 'id, order',
      budgets: 'monthKey',
      transactions: 'id, occurredAt, categoryId, nameLower, paidByPersonId, importBatchId, recurringId',
      people: 'id, nameLower',
      ledger: 'id, personId, occurredAt, transactionId, importBatchId',
      recurring: 'id',
      importBatches: 'id, createdAt',
    })
    await v1.open()
    await v1.table('transactions').put(txn('old', 'Chai', 1200))
    await v1.table('settings').put({ id: 'app', theme: 'light' })
    v1.close()

    const d = new KharchaDB(name)
    await d.open()
    expect(d.verno).toBe(3)
    expect(await d.groupOutbox.count()).toBe(0)
    expect(await d.transactions.get('old')).toMatchObject({ name: 'Chai' })
    expect(await d.settings.get('app')).toMatchObject({ theme: 'light' })
    expect(await d.syncOutbox.count()).toBe(0)

    await d.transactions.update('old', { amount: 1500 })
    expect(await outboxMap(d)).toEqual({ 'transactions:old': 'put' })
    d.close()
  })

  it('does not queue the seeded defaults', async () => {
    const d = await newDevice()
    expect(await d.categories.count()).toBe(13)
    expect(await d.syncOutbox.count()).toBe(0)
  })

  it('queues puts, updates, deletes, index deletes and clears — but not sync writes or non-synced tables', async () => {
    const d = await newDevice()
    await d.transactions.put(txn('t1', 'Chai', 1200))
    await d.transactions.update('t1', { amount: 1500 })
    const rec: Recurring = { id: 'r1', name: 'Rent', amount: 1, categoryId: 'home', paymentMethodId: null, dayOfMonth: 1, active: true, lastAddedMonthKey: null, createdAt: 1 }
    await d.recurring.put(rec)
    await d.recurring.delete('r1')
    await d.ledger.bulkPut([ledger('l1', 't1'), ledger('l2', 't1')])
    await d.ledger.where('transactionId').equals('t1').delete()
    await d.syncState.put({ key: 'x', value: 1 })
    await d.transaction('rw', d.people, async (tx) => {
      markRemote(tx)
      await d.people.put({ id: 'remote', name: 'R', nameLower: 'r', phone: '', note: '', archived: false, createdAt: 1 })
    })

    expect(await outboxMap(d)).toEqual({
      'transactions:t1': 'put',
      'recurring:r1': 'delete',
      'ledger:l1': 'delete',
      'ledger:l2': 'delete',
    })

    await d.paymentMethods.clear()
    expect((await d.syncOutbox.toArray()).filter((e) => e.table === 'paymentMethods' && e.op === 'delete')).toHaveLength(5)
  })

  it('atomically rolls back the queue entry when the write fails', async () => {
    const d = await newDevice()
    await d.transactions.add(txn('dup', 'Chai', 1)).catch(() => {})
    await d.syncOutbox.clear()
    await expect(d.transactions.add(txn('dup', 'Again', 2))).rejects.toThrow()
    expect(await d.syncOutbox.count()).toBe(0)
  })

  it('notifies live queries when the outbox changes', async () => {
    const d = await newDevice()
    const seen: number[] = []
    const sub = liveQuery(() => d.syncOutbox.count()).subscribe((n) => seen.push(n))
    await vi.waitFor(() => expect(seen).toContain(0))
    await d.transactions.put(txn('t1', 'Chai', 1200))
    await vi.waitFor(() => expect(seen.at(-1)).toBe(1))
    sub.unsubscribe()
  })
})

describe('push & pull', () => {
  it('converges two devices, including edits and deletes, without echoing pulled data back', async () => {
    const remote = new FakeRemote()
    const a = await newDevice()
    const b = await newDevice()

    await a.transactions.put(txn('t1', 'Chai', 1200))
    expect(await syncOnce(a, remote)).toEqual({ pushed: 1, pulled: 1 })
    expect(await a.syncOutbox.count()).toBe(0)

    await syncOnce(b, remote)
    expect(await b.transactions.get('t1')).toMatchObject({ name: 'Chai', amount: 1200 })
    expect(await b.syncOutbox.count()).toBe(0)
    expect(await getSyncState(b, 'lastRev', 0)).toBe(1)

    await b.transactions.update('t1', { amount: 2000 })
    await syncOnce(b, remote)
    await syncOnce(a, remote)
    expect((await a.transactions.get('t1'))?.amount).toBe(2000)

    await a.transactions.delete('t1')
    await syncOnce(a, remote)
    await syncOnce(b, remote)
    expect(await b.transactions.get('t1')).toBeUndefined()
    expect(remote.rows.get('transactions:t1')).toMatchObject({ deleted: true, data: null })
  })

  it('last write wins, and a newer pending local change survives an older remote one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const remote = new FakeRemote()
    const a = await newDevice()
    const b = await newDevice()
    vi.setSystemTime(1_000)
    await a.transactions.put(txn('t1', 'Chai', 1200))
    await syncOnce(a, remote)
    await syncOnce(b, remote)

    vi.setSystemTime(10_000)
    await a.transactions.update('t1', { name: 'From A (older)' })
    vi.setSystemTime(20_000)
    await b.transactions.update('t1', { name: 'From B (newer)' })

    await syncOnce(b, remote)
    await syncOnce(a, remote) // A's older push is rejected; B's newer version comes down
    expect((await a.transactions.get('t1'))?.name).toBe('From B (newer)')
    expect(remote.rows.get('transactions:t1')?.data).toMatchObject({ name: 'From B (newer)' })

    vi.setSystemTime(30_000)
    await a.transactions.update('t1', { name: 'A latest, offline' })
    await a.syncState.put({ key: 'lastRev', value: 0 }) // force re-pulling the older remote copy
    await pullChanges(a, remote)
    expect((await a.transactions.get('t1'))?.name).toBe('A latest, offline')
    expect(await a.syncOutbox.count()).toBe(1)
  })

  it('first link uploads existing data, but default config never overrides the cloud copy', async () => {
    const remote = new FakeRemote()
    const a = await newDevice()
    await a.settings.update('app', { theme: 'light', monthStartDay: 5 })
    await syncOnce(a, remote)

    const b = await newDevice()
    await b.transaction('rw', b.transactions, async (tx) => {
      markRemote(tx) // simulate data created before sync existed
      await b.transactions.put(txn('tb', 'Petrol', 37500, { createdAt: 5, updatedAt: 5 }))
    })
    expect(await b.syncOutbox.count()).toBe(0)

    expect(await enqueueAllLocal(b)).toBe(1 + 1 + 13 + 5) // expense + settings + categories + methods
    await syncOnce(b, remote)
    expect(await b.settings.get('app')).toMatchObject({ theme: 'light', monthStartDay: 5 })
    expect(await b.syncOutbox.count()).toBe(0)

    await syncOnce(a, remote)
    expect(await a.transactions.get('tb')).toMatchObject({ name: 'Petrol' })
  })

  it('clearLocalData wipes the device and restores defaults without queuing', async () => {
    const d = await newDevice()
    await d.transactions.put(txn('t1', 'Chai', 1200))
    await d.syncState.put({ key: 'userId', value: 'u1' })
    await clearLocalData(d)
    expect(await d.transactions.count()).toBe(0)
    expect(await d.categories.count()).toBe(13)
    expect(await d.settings.get('app')).toBeDefined()
    expect(await d.syncOutbox.count()).toBe(0)
    expect(await d.syncState.count()).toBe(0)
  })

  it('pushes large queues in batches', async () => {
    const remote = new FakeRemote()
    const d = await newDevice()
    await d.transactions.bulkPut(Array.from({ length: 450 }, (_, i) => txn(`t${i}`, 'Chai', i + 1)))
    const spy = vi.spyOn(remote, 'push')
    const { pushed } = await syncOnce(d, remote)
    expect(pushed).toBe(450)
    expect(spy).toHaveBeenCalledTimes(3)
    expect(await d.syncOutbox.count()).toBe(0)
  })
})
