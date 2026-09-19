import type { SupabaseClient } from '@supabase/supabase-js'
import type { Group, GroupKind, GroupMember } from '@/lib/groupTypes'
import type { GroupRecord, GroupRemote } from './groupEngine'

const ms = (t: string | null | undefined) => (t ? new Date(t).getTime() : null)

function fail(error: { message: string; code?: string } | null): void {
  if (!error) return
  if (error.code === 'PGRST202' || error.code === 'PGRST205' || /schema cache/i.test(error.message)) {
    throw new Error("Shared groups aren't set up in Supabase yet. Run the groups SQL migration.")
  }
  if (error.code === '23514' && /upi/i.test(error.message)) throw new Error("That UPI ID doesn't look right (example: name@okaxis)")
  throw new Error(error.message)
}

export function createGroupRemote(client: SupabaseClient): GroupRemote {
  return {
    async fetchMembership() {
      const g = await client.from('groups').select('id, name, kind, simplify_debts, created_by, created_at, updated_at')
      fail(g.error)
      const m = await client.from('group_members').select('id, group_id, user_id, display_name, role, joined_at, left_at')
      fail(m.error)
      const userIds = [...new Set((m.data ?? []).map((r) => r.user_id as string | null).filter((x): x is string => Boolean(x)))]
      const profiles = new Map<string, { upi_id: string | null; avatar_url: string | null }>()
      if (userIds.length) {
        const p = await client.from('profiles').select('user_id, upi_id, avatar_url').in('user_id', userIds)
        fail(p.error)
        for (const r of p.data ?? []) profiles.set(r.user_id, { upi_id: r.upi_id, avatar_url: r.avatar_url })
      }
      const groups: Group[] = (g.data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        simplifyDebts: r.simplify_debts,
        createdBy: r.created_by,
        createdAt: ms(r.created_at) ?? 0,
        updatedAt: ms(r.updated_at) ?? 0,
      }))
      const members: GroupMember[] = (m.data ?? []).map((r) => ({
        id: r.id,
        groupId: r.group_id,
        userId: r.user_id,
        displayName: r.display_name,
        role: r.role,
        joinedAt: ms(r.joined_at),
        leftAt: ms(r.left_at),
        upiId: r.user_id ? (profiles.get(r.user_id)?.upi_id ?? null) : null,
        avatarUrl: r.user_id ? (profiles.get(r.user_id)?.avatar_url ?? null) : null,
      }))
      return { groups, members }
    },
    async push(groupId, records) {
      const { error } = await client.rpc('group_push', { p_group: groupId, p_records: records })
      fail(error)
    },
    async pull(groupId, sinceRev, limit) {
      const { data, error } = await client
        .from('group_records')
        .select('kind, id, data, deleted, client_updated_at, rev')
        .eq('group_id', groupId)
        .gt('rev', sinceRev)
        .order('rev', { ascending: true })
        .limit(limit)
      fail(error)
      return (data ?? []).map(
        (r): GroupRecord => ({
          kind: r.kind,
          id: r.id,
          data: r.data,
          deleted: r.deleted,
          client_updated_at: Number(r.client_updated_at),
          rev: Number(r.rev),
        }),
      )
    },
  }
}

export interface InvitePreview {
  group_id: string
  name: string
  kind: GroupKind
  already_member: boolean
  members: { id: string; display_name: string; placeholder: boolean }[]
}

export interface ActivityItem {
  id: number
  actor: string | null
  action: string
  record_id: string | null
  summary: Record<string, unknown> | null
  created_at: string
}

export interface MyProfile {
  displayName: string
  upiId: string | null
}

async function rpc<T>(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args)
  fail(error)
  return data as T
}

/** Online-only group actions (they need the server): create, invite, join, leave, profile… */
export function createGroupApi(client: SupabaseClient, userId: string) {
  return {
    createGroup: (name: string, kind: GroupKind, displayName: string) =>
      rpc<string>(client, 'create_group', { p_name: name, p_kind: kind, p_display_name: displayName }),
    updateGroup: (groupId: string, patch: { name?: string; kind?: GroupKind; simplifyDebts?: boolean }) =>
      rpc<null>(client, 'update_group', {
        p_group: groupId,
        p_name: patch.name ?? null,
        p_kind: patch.kind ?? null,
        p_simplify: patch.simplifyDebts ?? null,
      }),
    addPlaceholder: (groupId: string, name: string) => rpc<string>(client, 'add_placeholder', { p_group: groupId, p_name: name }),
    removeMember: (memberId: string) => rpc<null>(client, 'remove_member', { p_member: memberId }),
    leaveGroup: (groupId: string) => rpc<null>(client, 'leave_group', { p_group: groupId }),
    createInvite: (groupId: string, days = 30) => rpc<string>(client, 'create_invite', { p_group: groupId, p_days: days }),
    revokeInvite: (token: string) => rpc<null>(client, 'revoke_invite', { p_token: token }),
    previewInvite: (token: string) => rpc<InvitePreview>(client, 'preview_invite', { p_token: token }),
    joinGroup: (token: string, claimMemberId: string | null, displayName: string) =>
      rpc<string>(client, 'join_group', { p_token: token, p_claim: claimMemberId, p_display_name: displayName }),
    async fetchActivity(groupId: string, limit = 60): Promise<ActivityItem[]> {
      const { data, error } = await client
        .from('group_activity')
        .select('id, actor, action, record_id, summary, created_at')
        .eq('group_id', groupId)
        .order('id', { ascending: false })
        .limit(limit)
      fail(error)
      return (data ?? []) as ActivityItem[]
    },
    /** Server-side history of one expense or payment, oldest first. */
    async fetchRecordHistory(groupId: string, recordId: string): Promise<ActivityItem[]> {
      const { data, error } = await client
        .from('group_activity')
        .select('id, actor, action, record_id, summary, created_at')
        .eq('group_id', groupId)
        .eq('record_id', recordId)
        .order('id', { ascending: true })
        .limit(100)
      fail(error)
      return (data ?? []) as ActivityItem[]
    },
    async getMyProfile(): Promise<MyProfile | null> {
      const { data, error } = await client.from('profiles').select('display_name, upi_id').eq('user_id', userId).maybeSingle()
      fail(error)
      return data ? { displayName: data.display_name, upiId: data.upi_id } : null
    },
    async saveMyProfile(p: MyProfile): Promise<void> {
      const { error } = await client
        .from('profiles')
        .upsert(
          { user_id: userId, display_name: p.displayName, upi_id: p.upiId || null, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        )
      fail(error)
    },
  }
}

export type GroupApi = ReturnType<typeof createGroupApi>
