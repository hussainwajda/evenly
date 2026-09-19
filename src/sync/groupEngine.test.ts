import { describe, expect, it } from 'vitest'
import { KharchaDB } from '@/db'
import type { Group, GroupExpense, GroupMember } from '@/lib/groupTypes'
import {
  deleteGroupExpense,
  deleteSettlement,
  derivedTxnId,
  type GroupRecord,
  type GroupRecordIn,
  type GroupRemote,
  restoreSettlement,
  saveGroupExpense,
  saveSettlement,
  setSettlementStatus,
  syncGroups,
} from './groupEngine'
import { enqueueAllLocal } from './engine'

/** In-memory stand-in for Supabase: membership tables + group_records with last-write-wins. */
class FakeGroupServer {
  groups: Group[] = []
  members: GroupMember[] = []
  rows = new Map<string, GroupRecord & { groupId: string }>()
  rev = 0

  isMember(groupId: string, userId: string) {
    return this.members.some((m) => m.groupId === groupId && m.userId === userId && !m.leftAt)
  }

  remote(userId: string): GroupRemote {
    return {
      fetchMembership: async () => {
        const ids = new Set(this.members.filter((m) => m.userId === userId && !m.leftAt).map((m) => m.groupId))
        return structuredClone({ groups: this.groups.filter((g) => ids.has(g.id)), members: this.members.filter((m) => ids.has(m.groupId)) })
      },
      push: async (groupId: string, records: GroupRecordIn[]) => {
        if (!this.isMember(groupId, userId)) throw new Error('You are not a member of this group')
        for (const r of records) {
          const key = `${groupId}:${r.kind}:${r.id}`
          const cur = this.rows.get(key)
          if (cur && r.client_updated_at < cur.client_updated_at) continue
          this.rows.set(key, { ...structuredClone(r), data: structuredClone(r.data ?? cur?.data ?? null), groupId, rev: ++this.rev })
        }
      },
      pull: async (groupId: string, since: number, limit: number) => {
        if (!this.isMember(groupId, userId)) throw new Error('You are not a member of this group')
        return [...this.rows.values()]
          .filter((r) => r.groupId === groupId && r.rev > since)
          .sort((a, b) => a.rev - b.rev)
          .slice(0, limit)
          .map(({ groupId: _g, ...r }) => structuredClone(r))
      },
    }
  }
}

const member = (id: string, userId: string | null, displayName: string): GroupMember => ({
  id,
  groupId: 'g1',
  userId,
  displayName,
  role: id === 'm1' ? 'owner' : 'member',
  joinedAt: userId ? 1 : null,
  leftAt: null,
  upiId: null,
  avatarUrl: null,
})

function setupServer() {
  const server = new FakeGroupServer()
  server.groups = [{ id: 'g1', name: 'Flat 402', kind: 'home', simplifyDebts: true, createdBy: 'u1', createdAt: 1, updatedAt: 1 }]
  server.members = [member('m1', 'u1', 'Aadit'), member('m2', 'u2', 'Rahul'), member('m3', null, 'Priya')]
  return server
}

let n = 0
async function device(userId: string) {
  const d = new KharchaDB(`group-test-${++n}`)
  await d.open()
  await d.syncState.put({ key: 'userId', value: userId })
  return d
}

const dinner = (): Omit<GroupExpense, 'updatedAt' | 'deletedAt'> => ({
  id: 'e1',
  groupId: 'g1',
  title: 'Dinner',
  amount: 90000,
  categoryId: 'food',
  occurredAt: new Date(2026, 8, 18, 20).getTime(),
  note: '',
  createdBy: 'm1',
  payers: [{ memberId: 'm1', amount: 90000 }],
  split: { method: 'equal', entries: ['m1', 'm2', 'm3'].map((memberId) => ({ memberId, value: 1 })) },
  shares: ['m1', 'm2', 'm3'].map((memberId) => ({ memberId, amount: 30000 })),
})

describe('group sync', () => {
  it('adds each member their own share automatically, and keeps it out of personal sync', async () => {
    const server = setupServer()
    const a = await device('u1')
    const b = await device('u2')
    await syncGroups(a, server.remote('u1'))
    await syncGroups(b, server.remote('u2'))

    await saveGroupExpense(a, dinner())
    expect(await a.transactions.get(derivedTxnId('e1'))).toMatchObject({
      name: 'Dinner',
      amount: 30000,
      grossAmount: 90000,
      source: 'group',
      groupPaidBy: 'you',
      groupBill: 90000,
      paymentMethodId: 'upi-navi',
    })
    expect(await a.syncOutbox.count()).toBe(0)
    expect(await a.groupOutbox.count()).toBe(1)

    expect(await syncGroups(a, server.remote('u1'))).toMatchObject({ groups: 1, pushed: 1 })
    expect(await a.groupOutbox.count()).toBe(0)
    await syncGroups(b, server.remote('u2'))

    expect(await b.transactions.get(derivedTxnId('e1'))).toMatchObject({
      amount: 30000,
      grossAmount: 0,
      paymentMethodId: null,
      groupPaidBy: 'Aadit',
    })
    expect(await b.syncOutbox.count()).toBe(0)
    expect(await enqueueAllLocal(b)).toBe(1 + 13 + 5) // settings + categories + methods — not the group share
  })

  it('shares payments and deletes, and removes my copy when the expense is deleted', async () => {
    const server = setupServer()
    const a = await device('u1')
    const b = await device('u2')
    await syncGroups(a, server.remote('u1'))
    await syncGroups(b, server.remote('u2'))
    await saveGroupExpense(a, dinner())
    await syncGroups(a, server.remote('u1'))
    await syncGroups(b, server.remote('u2'))

    await saveSettlement(b, {
      id: 's1', groupId: 'g1', from: 'm2', to: 'm1', amount: 30000, method: 'upi', occurredAt: 5, note: '', expenseId: 'e1', status: 'recorded',
    })
    await syncGroups(b, server.remote('u2'))
    await syncGroups(a, server.remote('u1'))
    expect(await a.groupSettlements.get('s1')).toMatchObject({ from: 'm2', amount: 30000, status: 'recorded', deletedAt: null })

    await deleteGroupExpense(b, 'e1')
    expect(await b.transactions.get(derivedTxnId('e1'))).toBeUndefined()
    await syncGroups(b, server.remote('u2'))
    await syncGroups(a, server.remote('u1'))
    expect((await a.groupExpenses.get('e1'))?.deletedAt).toBeTypeOf('number')
    expect(await a.transactions.get(derivedTxnId('e1'))).toBeUndefined()
  })

  it('keeps a history of who recorded, confirmed and deleted a payment, and enforces who may', async () => {
    const server = setupServer()
    const a = await device('u1')
    const b = await device('u2')
    await syncGroups(a, server.remote('u1'))
    await syncGroups(b, server.remote('u2'))

    await saveSettlement(b, {
      id: 's1', groupId: 'g1', from: 'm2', to: 'm1', amount: 30000, method: 'cash', occurredAt: 5, note: '', expenseId: null, status: 'recorded',
    })
    // Rahul paid it, so he can't confirm it himself.
    await expect(setSettlementStatus(b, ['s1'], 'confirmed')).rejects.toThrow(/received/)
    await syncGroups(b, server.remote('u2'))
    await syncGroups(a, server.remote('u1'))

    await setSettlementStatus(a, ['s1'], 'confirmed')
    await syncGroups(a, server.remote('u1'))
    await syncGroups(b, server.remote('u2'))
    const s = await b.groupSettlements.get('s1')
    expect(s).toMatchObject({ status: 'confirmed', createdBy: 'm2' })
    expect(s?.history?.map((h) => [h.action, h.by])).toEqual([
      ['recorded', 'm2'],
      ['confirmed', 'm1'],
    ])

    await deleteSettlement(a, 's1')
    await syncGroups(a, server.remote('u1'))
    await syncGroups(b, server.remote('u2'))
    await restoreSettlement(b, 's1')
    expect((await b.groupSettlements.get('s1'))?.history?.at(-1)).toMatchObject({ action: 'restored', by: 'm2' })
  })

  it('a newer local edit survives an older remote copy', async () => {
    const server = setupServer()
    const a = await device('u1')
    await syncGroups(a, server.remote('u1'))
    await saveGroupExpense(a, dinner())
    await syncGroups(a, server.remote('u1'))
    await saveGroupExpense(a, { ...dinner(), title: 'Dinner (edited offline)' })
    await a.groupSyncState.put({ groupId: 'g1', lastRev: 0 })
    const { pullGroupChanges } = await import('./groupEngine')
    await pullGroupChanges(a, server.remote('u1'))
    expect((await a.groupExpenses.get('e1'))?.title).toBe('Dinner (edited offline)')
    expect(await a.groupOutbox.count()).toBe(1)
  })

  it('a placeholder who joins gets their share of existing expenses', async () => {
    const server = setupServer()
    const a = await device('u1')
    await syncGroups(a, server.remote('u1'))
    await saveGroupExpense(a, dinner())
    await syncGroups(a, server.remote('u1'))

    server.members = server.members.map((m) => (m.id === 'm3' ? { ...m, userId: 'u3', joinedAt: 9 } : m))
    const c = await device('u3')
    await syncGroups(c, server.remote('u3'))
    expect(await c.transactions.get(derivedTxnId('e1'))).toMatchObject({ amount: 30000, groupPaidBy: 'Aadit' })
  })

  it('leaving a group removes its data and my shares from this device', async () => {
    const server = setupServer()
    const b = await device('u2')
    await syncGroups(b, server.remote('u2'))
    const a = await device('u1')
    await syncGroups(a, server.remote('u1'))
    await saveGroupExpense(a, dinner())
    await syncGroups(a, server.remote('u1'))
    await syncGroups(b, server.remote('u2'))
    expect(await b.transactions.get(derivedTxnId('e1'))).toBeDefined()

    await saveGroupExpense(b, { ...dinner(), id: 'e2', title: 'Unsent' })
    server.members = server.members.map((m) => (m.id === 'm2' ? { ...m, leftAt: 10 } : m))
    await syncGroups(b, server.remote('u2'))
    expect(await b.groups.count()).toBe(0)
    expect(await b.groupExpenses.count()).toBe(0)
    expect(await b.groupOutbox.count()).toBe(0)
    expect(await b.transactions.count()).toBe(0)
  })
})
