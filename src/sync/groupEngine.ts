/**
 * Offline-first sync for shared groups.
 *  • Local writes go to the group cache + groupOutbox, and my own share is (re)built as a personal
 *    transaction ("derived" row, id grp-<expenseId>) in the same transaction — marked remote so it is
 *    never uploaded as personal data.
 *  • Sync = refresh membership → push queued records → pull records since each group's last revision.
 */
import type { KharchaDB } from '@/db'
import { markRemote } from '@/db/syncMiddleware'
import type { Group, GroupExpense, GroupMember, GroupRecordKind, Settlement, SettlementStatus } from '@/lib/groupTypes'
import type { Transaction } from '@/lib/types'

export interface GroupRecordIn {
  kind: GroupRecordKind
  id: string
  data: unknown
  deleted: boolean
  client_updated_at: number
}

export interface GroupRecord extends GroupRecordIn {
  rev: number
}

export interface GroupSnapshot {
  groups: Group[]
  members: GroupMember[]
}

/** Cloud side of group sync. Supabase in the app, an in-memory fake in tests. */
export interface GroupRemote {
  fetchMembership(): Promise<GroupSnapshot>
  push(groupId: string, records: GroupRecordIn[]): Promise<void>
  pull(groupId: string, sinceRev: number, limit: number): Promise<GroupRecord[]>
}

const PAGE = 500
const PUSH_BATCH = 200

export const derivedTxnId = (expenseId: string) => `grp-${expenseId}`

async function currentUserId(db: KharchaDB): Promise<string | null> {
  const row = await db.syncState.get('userId')
  return typeof row?.value === 'string' ? row.value : null
}

function tables(db: KharchaDB) {
  return [db.groups, db.groupMembers, db.groupExpenses, db.groupSettlements, db.groupOutbox, db.groupSyncState, db.transactions, db.settings, db.syncState]
}

const lower = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/** Rebuild my personal copy (my share) of these group expenses. Must run inside a markRemote transaction. */
async function rederive(db: KharchaDB, expenseIds: Iterable<string>, userId: string | null): Promise<void> {
  const defaultMethod = (await db.settings.get('app'))?.defaultPaymentMethodId ?? null
  for (const expenseId of expenseIds) {
    const txnId = derivedTxnId(expenseId)
    const e = await db.groupExpenses.get(expenseId)
    if (!e || e.deletedAt) {
      await db.transactions.delete(txnId)
      continue
    }
    if (!userId) continue
    const members = await db.groupMembers.where('groupId').equals(e.groupId).toArray()
    const me = members.find((m) => m.userId === userId && !m.leftAt)
    const share = me ? (e.shares.find((s) => s.memberId === me.id)?.amount ?? 0) : 0
    const paid = me ? (e.payers.find((p) => p.memberId === me.id)?.amount ?? 0) : 0
    if (!me || (share === 0 && paid === 0)) {
      await db.transactions.delete(txnId)
      continue
    }
    const paidBy = e.payers
      .filter((p) => p.amount > 0)
      .map((p) => (p.memberId === me.id ? 'you' : (members.find((m) => m.id === p.memberId)?.displayName ?? 'someone')))
      .join(' & ')
    const txn: Transaction = {
      id: txnId,
      name: e.title,
      nameLower: lower(e.title),
      amount: share,
      grossAmount: paid,
      categoryId: e.categoryId,
      paymentMethodId: paid > 0 ? defaultMethod : null,
      occurredAt: e.occurredAt,
      note: e.note,
      tags: [],
      source: 'group',
      excludeFromSpend: false,
      paidByPersonId: null,
      shares: [],
      recurringId: null,
      importBatchId: null,
      createdAt: e.updatedAt,
      updatedAt: e.updatedAt,
      deletedAt: null,
      groupId: e.groupId,
      groupExpenseId: e.id,
      groupBill: e.amount,
      groupPaidBy: paidBy,
    }
    await db.transactions.put(txn)
  }
}

async function writeLocal(db: KharchaDB, kind: GroupRecordKind, row: GroupExpense | Settlement): Promise<void> {
  const userId = await currentUserId(db)
  await db.transaction('rw', tables(db), async (tx) => {
    markRemote(tx)
    if (kind === 'expense') await db.groupExpenses.put(row as GroupExpense)
    else await db.groupSettlements.put(row as Settlement)
    await db.groupOutbox.put({ groupId: row.groupId, kind, id: row.id, updatedAt: row.updatedAt })
    if (kind === 'expense') await rederive(db, [row.id], userId)
  })
}

/* ───────────────────────── Local actions (work offline) ───────────────────────── */

export async function saveGroupExpense(db: KharchaDB, expense: Omit<GroupExpense, 'updatedAt' | 'deletedAt'>): Promise<void> {
  await writeLocal(db, 'expense', { ...expense, updatedAt: Date.now(), deletedAt: null })
}

export async function deleteGroupExpense(db: KharchaDB, id: string): Promise<void> {
  const e = await db.groupExpenses.get(id)
  if (e) await writeLocal(db, 'expense', { ...e, deletedAt: Date.now(), updatedAt: Date.now() })
}

export async function restoreGroupExpense(db: KharchaDB, id: string): Promise<void> {
  const e = await db.groupExpenses.get(id)
  if (e) await writeLocal(db, 'expense', { ...e, deletedAt: null, updatedAt: Date.now() })
}

export async function saveSettlement(db: KharchaDB, s: Omit<Settlement, 'updatedAt' | 'deletedAt'>): Promise<void> {
  await writeLocal(db, 'settlement', { ...s, updatedAt: Date.now(), deletedAt: null })
}

export async function setSettlementStatus(db: KharchaDB, ids: string[], status: SettlementStatus): Promise<void> {
  for (const id of ids) {
    const s = await db.groupSettlements.get(id)
    if (s) await writeLocal(db, 'settlement', { ...s, status, updatedAt: Date.now() })
  }
}

export async function deleteSettlement(db: KharchaDB, id: string): Promise<void> {
  const s = await db.groupSettlements.get(id)
  if (s) await writeLocal(db, 'settlement', { ...s, deletedAt: Date.now(), updatedAt: Date.now() })
}

export async function restoreSettlement(db: KharchaDB, id: string): Promise<void> {
  const s = await db.groupSettlements.get(id)
  if (s) await writeLocal(db, 'settlement', { ...s, deletedAt: null, updatedAt: Date.now() })
}

/* ───────────────────────── Sync ───────────────────────── */

/** Replace the local picture of which groups I'm in (and who's in them); drop groups I've left. */
export async function applyMembership(db: KharchaDB, snap: GroupSnapshot): Promise<void> {
  const userId = await currentUserId(db)
  await db.transaction('rw', tables(db), async (tx) => {
    markRemote(tx)
    const keep = new Set(snap.groups.map((g) => g.id))
    for (const g of await db.groups.toArray()) {
      if (keep.has(g.id)) continue
      await db.groupMembers.where('groupId').equals(g.id).delete()
      await db.groupExpenses.where('groupId').equals(g.id).delete()
      await db.groupSettlements.where('groupId').equals(g.id).delete()
      const queued = (await db.groupOutbox.toArray()).filter((o) => o.groupId === g.id)
      await db.groupOutbox.bulkDelete(queued.map((o) => [o.groupId, o.kind, o.id] as [string, string, string]))
      await db.groupSyncState.delete(g.id)
      await db.transactions.filter((t) => t.groupId === g.id).delete()
      await db.groups.delete(g.id)
    }
    await db.groups.bulkPut(snap.groups)
    for (const g of snap.groups) await db.groupMembers.where('groupId').equals(g.id).delete()
    await db.groupMembers.bulkPut(snap.members)
    // Membership can change whose share is "mine" (e.g. I claimed a placeholder), so rebuild all of it.
    await rederive(db, (await db.groupExpenses.toArray()).map((e) => e.id), userId)
  })
}

export async function pushGroupChanges(db: KharchaDB, remote: GroupRemote): Promise<number> {
  const entries = await db.groupOutbox.orderBy('updatedAt').toArray()
  const byGroup = new Map<string, typeof entries>()
  for (const e of entries) byGroup.set(e.groupId, [...(byGroup.get(e.groupId) ?? []), e])

  let pushed = 0
  for (const [groupId, list] of byGroup) {
    for (let i = 0; i < list.length; i += PUSH_BATCH) {
      const batch = list.slice(i, i + PUSH_BATCH)
      const records: GroupRecordIn[] = []
      for (const e of batch) {
        const row = e.kind === 'expense' ? await db.groupExpenses.get(e.id) : await db.groupSettlements.get(e.id)
        records.push({ kind: e.kind, id: e.id, data: row ?? null, deleted: !row || Boolean(row.deletedAt), client_updated_at: e.updatedAt })
      }
      try {
        await remote.push(groupId, records)
      } catch (err) {
        if (/not a member/i.test(err instanceof Error ? err.message : String(err))) {
          // I've left or been removed: these changes can never be uploaded.
          await db.groupOutbox.bulkDelete(list.map((o) => [o.groupId, o.kind, o.id] as [string, string, string]))
          break
        }
        throw err
      }
      await db.transaction('rw', db.groupOutbox, async () => {
        for (const e of batch) {
          const cur = await db.groupOutbox.get([e.groupId, e.kind, e.id])
          if (cur && cur.updatedAt === e.updatedAt) await db.groupOutbox.delete([e.groupId, e.kind, e.id])
        }
      })
      pushed += batch.length
    }
  }
  return pushed
}

export async function pullGroupChanges(db: KharchaDB, remote: GroupRemote): Promise<number> {
  const userId = await currentUserId(db)
  let applied = 0
  for (const g of await db.groups.toArray()) {
    let since = (await db.groupSyncState.get(g.id))?.lastRev ?? 0
    for (;;) {
      const page = await remote.pull(g.id, since, PAGE)
      if (!page.length) break
      await db.transaction('rw', tables(db), async (tx) => {
        markRemote(tx)
        const touched: string[] = []
        for (const rec of page) {
          since = Math.max(since, rec.rev)
          const pending = await db.groupOutbox.get([g.id, rec.kind, rec.id])
          if (pending && pending.updatedAt > rec.client_updated_at) continue // my newer change will be pushed
          const data = rec.data && typeof rec.data === 'object' ? (rec.data as Record<string, unknown>) : null
          const deletedAt = rec.deleted ? ((data?.deletedAt as number | null | undefined) ?? rec.client_updated_at) : null
          if (rec.kind === 'expense') {
            if (data) await db.groupExpenses.put({ ...(data as unknown as GroupExpense), id: rec.id, groupId: g.id, deletedAt })
            else await db.groupExpenses.delete(rec.id)
            touched.push(rec.id)
          } else if (data) {
            await db.groupSettlements.put({ ...(data as unknown as Settlement), id: rec.id, groupId: g.id, deletedAt })
          } else {
            await db.groupSettlements.delete(rec.id)
          }
          if (pending) await db.groupOutbox.delete([g.id, rec.kind, rec.id])
          applied++
        }
        await db.groupSyncState.put({ groupId: g.id, lastRev: since })
        await rederive(db, touched, userId)
      })
      if (page.length < PAGE) break
    }
  }
  return applied
}

export async function syncGroups(db: KharchaDB, remote: GroupRemote): Promise<{ groups: number; pushed: number; pulled: number }> {
  const snap = await remote.fetchMembership()
  await applyMembership(db, snap)
  const pushed = await pushGroupChanges(db, remote)
  const pulled = await pullGroupChanges(db, remote)
  return { groups: snap.groups.length, pushed, pulled }
}
