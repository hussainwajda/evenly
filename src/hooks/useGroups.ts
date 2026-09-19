import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '@/db'
import { groupTransfers, memberNets, pairLedger, type ShareStatus, shareStatuses, type Transfer } from '@/lib/groupMath'
import type { Group, GroupExpense, GroupKind, GroupMember, Settlement } from '@/lib/groupTypes'
import { useSyncStore } from '@/sync/controller'

/** Signed-in user id, falling back to the account this device is linked to (works offline). */
export function useMyUserId(): string | null {
  const live = useSyncStore((s) => s.user?.id ?? null)
  const stored = useLiveQuery(async () => {
    const v = (await db.syncState.get('userId'))?.value
    return typeof v === 'string' ? v : null
  }, [], null)
  return live ?? stored
}

export interface GroupSummary {
  group: Group
  members: GroupMember[]
  meId: string | null
  /** Positive: the group owes me. */
  myNet: number
  expenseCount: number
  lastActivity: number
}

export function useGroupSummaries(): GroupSummary[] | undefined {
  const userId = useMyUserId()
  return useLiveQuery(async () => {
    const [groups, members, expenses, settlements] = await Promise.all([
      db.groups.toArray(),
      db.groupMembers.toArray(),
      db.groupExpenses.toArray(),
      db.groupSettlements.toArray(),
    ])
    return groups
      .map((group) => {
        const gm = members.filter((m) => m.groupId === group.id)
        const ge = expenses.filter((e) => e.groupId === group.id)
        const gs = settlements.filter((s) => s.groupId === group.id)
        const me = gm.find((m) => m.userId === userId && !m.leftAt) ?? null
        const nets = memberNets(ge, gs)
        return {
          group,
          members: gm.filter((m) => !m.leftAt),
          meId: me?.id ?? null,
          myNet: me ? (nets.get(me.id) ?? 0) : 0,
          expenseCount: ge.filter((e) => !e.deletedAt).length,
          lastActivity: Math.max(group.updatedAt, ...ge.map((e) => e.updatedAt), ...gs.map((s) => s.updatedAt)),
        }
      })
      .sort((a, b) => b.lastActivity - a.lastActivity)
  }, [userId])
}

export interface GroupData {
  group: Group
  members: GroupMember[]
  activeMembers: GroupMember[]
  memberMap: Map<string, GroupMember>
  meId: string | null
  /** Live (not deleted) bills and payments, newest first. */
  expenses: GroupExpense[]
  settlements: Settlement[]
  /** Everything, including deleted bills and payments (for statements and history). */
  allExpenses: GroupExpense[]
  allSettlements: Settlement[]
  nets: Map<string, number>
  transfers: Transfer[]
  statuses: Map<string, ShareStatus[]>
}

/** undefined while loading, null if the group isn't on this device. */
export function useGroupData(groupId: string | null | undefined): GroupData | null | undefined {
  const userId = useMyUserId()
  const raw = useLiveQuery(async () => {
    if (!groupId) return null
    const group = await db.groups.get(groupId)
    if (!group) return null
    const [members, expenses, settlements] = await Promise.all([
      db.groupMembers.where('groupId').equals(groupId).toArray(),
      db.groupExpenses.where('groupId').equals(groupId).toArray(),
      db.groupSettlements.where('groupId').equals(groupId).toArray(),
    ])
    return { group, members, expenses, settlements }
  }, [groupId])

  return useMemo(() => {
    if (raw === undefined) return undefined
    if (raw === null) return null
    const { group, members, expenses, settlements } = raw
    const live = expenses.filter((e) => !e.deletedAt).sort((a, b) => b.occurredAt - a.occurredAt)
    const liveSettlements = settlements.filter((s) => !s.deletedAt).sort((a, b) => b.occurredAt - a.occurredAt)
    return {
      group,
      members,
      activeMembers: members.filter((m) => !m.leftAt),
      memberMap: new Map(members.map((m) => [m.id, m])),
      meId: members.find((m) => m.userId === userId && !m.leftAt)?.id ?? null,
      expenses: live,
      settlements: liveSettlements,
      allExpenses: expenses,
      allSettlements: settlements,
      nets: memberNets(live, liveSettlements),
      transfers: groupTransfers(group.simplifyDebts, live, liveSettlements),
      statuses: shareStatuses(live, liveSettlements, group.simplifyDebts),
    }
  }, [raw, userId])
}

/** "You", a member's name, or "Someone". */
export function memberLabel(data: Pick<GroupData, 'meId' | 'memberMap'>, memberId: string | null | undefined): string {
  if (!memberId) return 'Someone'
  if (memberId === data.meId) return 'You'
  return data.memberMap.get(memberId)?.displayName ?? 'Someone'
}

export interface FriendGroup {
  groupId: string
  groupName: string
  kind: GroupKind
  meId: string
  memberId: string
  /** Direct balance in this group. Positive: they owe me. */
  balance: number
}

export interface Friend {
  userId: string
  name: string
  avatarUrl: string | null
  upiId: string | null
  groups: FriendGroup[]
  /** Across all shared groups. Positive: they owe me. */
  total: number
}

/** Everyone I share a group with (who has joined), with our direct balance in each group. */
export function useFriends(): Friend[] | undefined {
  const userId = useMyUserId()
  return useLiveQuery(async () => {
    if (!userId) return []
    const [groups, members, expenses, settlements] = await Promise.all([
      db.groups.toArray(),
      db.groupMembers.toArray(),
      db.groupExpenses.toArray(),
      db.groupSettlements.toArray(),
    ])
    const friends = new Map<string, Friend>()
    for (const group of groups) {
      const gm = members.filter((m) => m.groupId === group.id)
      const me = gm.find((m) => m.userId === userId && !m.leftAt)
      if (!me) continue
      const ge = expenses.filter((e) => e.groupId === group.id)
      const gs = settlements.filter((s) => s.groupId === group.id)
      for (const m of gm) {
        if (!m.userId || m.userId === userId) continue
        const balance = pairLedger(ge, gs, me.id, m.id).balance
        if (m.leftAt && !balance) continue
        const f = friends.get(m.userId) ?? { userId: m.userId, name: m.displayName, avatarUrl: m.avatarUrl, upiId: m.upiId, groups: [], total: 0 }
        f.avatarUrl ??= m.avatarUrl
        f.upiId ??= m.upiId
        f.groups.push({ groupId: group.id, groupName: group.name, kind: group.kind, meId: me.id, memberId: m.id, balance })
        f.total += balance
        friends.set(m.userId, f)
      }
    }
    return [...friends.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.name.localeCompare(b.name))
  }, [userId])
}

