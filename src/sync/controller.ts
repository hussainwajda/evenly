/**
 * Runtime side of cloud sync: Google sign-in, when to sync, Realtime nudges, and a status store for the UI.
 * All data work lives in ./engine and ./groupEngine (unit-tested); this file only orchestrates.
 */
import type { RealtimeChannel, Session, SupabaseClient } from '@supabase/supabase-js'
import { liveQuery } from 'dexie'
import { create } from 'zustand'
import { db } from '@/db'
import { clearLocalData, enqueueAllLocal, getSyncState, setSyncState, syncOnce } from './engine'
import { syncGroups } from './groupEngine'
import { createGroupApi, createGroupRemote, type GroupApi } from './groupRemote'
import { createSupabaseRemote, deleteCloudRecords, getSupabase, isCloudConfigured } from './supabase'

export type SyncStatus = 'disabled' | 'loading' | 'signedOut' | 'idle' | 'syncing' | 'offline' | 'error' | 'accountConflict'

export interface SyncUser {
  id: string
  email: string
  name: string
  avatarUrl: string | null
}

export interface SyncState {
  status: SyncStatus
  user: SyncUser | null
  /** Local changes not uploaded yet (personal + shared groups). */
  pending: number
  lastSyncedAt: number | null
  error: string | null
  /** Problem syncing shared groups (personal sync may still be fine). */
  groupError: string | null
  online: boolean
}

export const useSyncStore = create<SyncState>(() => ({
  status: isCloudConfigured ? 'loading' : 'disabled',
  user: null,
  pending: 0,
  lastSyncedAt: null,
  error: null,
  groupError: null,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
}))

const set = useSyncStore.setState

let client: SupabaseClient | null = null
let channels: RealtimeChannel[] = []
let started = false
let running = false
let rerun = false
let timer: number | undefined
let linkedUserId: string | null = null

function errorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/failed to fetch|network/i.test(msg)) return 'Network problem'
  if (/kharcha_push|kharcha_records/i.test(msg) && /not find|does not exist|schema cache/i.test(msg)) {
    return 'Cloud database not set up (run the SQL migration)'
  }
  return msg
}

function toUser(session: Session): SyncUser {
  const u = session.user
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>
  return {
    id: u.id,
    email: u.email ?? '',
    name: String(meta.full_name ?? meta.name ?? u.email ?? 'You'),
    avatarUrl: typeof meta.avatar_url === 'string' ? meta.avatar_url : typeof meta.picture === 'string' ? meta.picture : null,
  }
}

/** Call once at startup. Safe to call when sync isn't configured. */
export async function startSync(): Promise<void> {
  if (started || !isCloudConfigured) return
  started = true

  liveQuery(async () => (await db.syncOutbox.count()) + (await db.groupOutbox.count())).subscribe({
    next: (pending) => {
      set({ pending })
      if (pending > 0) scheduleSync(2000)
    },
    error: () => {},
  })
  void getSyncState<number | null>(db, 'lastSyncedAt', null).then((lastSyncedAt) => set({ lastSyncedAt }))

  window.addEventListener('online', () => {
    set({ online: true })
    scheduleSync(0)
  })
  window.addEventListener('offline', () => {
    set({ online: false })
    const s = useSyncStore.getState()
    if (s.user && (s.status === 'idle' || s.status === 'syncing' || s.status === 'error')) set({ status: 'offline' })
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(0)
  })
  window.setInterval(() => scheduleSync(0), 5 * 60_000)

  try {
    client = await getSupabase()
  } catch (e) {
    set({ status: 'error', error: errorMessage(e) })
    return
  }

  // Don't call Supabase inside this callback directly (it can deadlock the auth lock); defer instead.
  client.auth.onAuthStateChange((_event, session) => {
    window.setTimeout(() => void handleSession(session), 0)
  })
  const { data } = await client.auth.getSession()
  await handleSession(data.session)
}

async function handleSession(session: Session | null): Promise<void> {
  if (!session) {
    linkedUserId = null
    unsubscribeRealtime()
    set({ user: null, status: 'signedOut', error: null, groupError: null })
    return
  }

  const user = toUser(session)
  set({ user })
  if (linkedUserId === user.id) return

  const deviceUser = await getSyncState<string | null>(db, 'userId', null)
  if (deviceUser && deviceUser !== user.id) {
    set({ status: 'accountConflict' })
    return
  }
  if (!deviceUser) {
    await enqueueAllLocal(db)
    await setSyncState(db, 'userId', user.id)
  }
  await activate(user)
}

async function activate(user: SyncUser) {
  linkedUserId = user.id
  subscribeRealtime(user.id)
  void ensureProfile(user)
  set({ status: navigator.onLine ? 'idle' : 'offline' })
  await runSync()
}

/** Creates my group profile (name + photo from Google) the first time; never overwrites edits. */
async function ensureProfile(user: SyncUser) {
  if (!client) return
  await client
    .from('profiles')
    .upsert({ user_id: user.id, display_name: user.name, avatar_url: user.avatarUrl }, { onConflict: 'user_id', ignoreDuplicates: true })
}

function subscribeRealtime(userId: string) {
  if (!client) return
  unsubscribeRealtime()
  // Separate channels, so a missing groups migration can't break personal sync notifications.
  channels = [
    client
      .channel(`kharcha-records-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kharcha_records', filter: `user_id=eq.${userId}` }, () =>
        scheduleSync(800),
      )
      .subscribe(),
    client
      .channel(`kharcha-groups-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_records' }, () => scheduleSync(800))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members' }, () => scheduleSync(800))
      .subscribe(),
  ]
}

function unsubscribeRealtime() {
  if (client) for (const ch of channels) void client.removeChannel(ch)
  channels = []
}

export function scheduleSync(delayMs = 1500): void {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => void runSync(), delayMs)
}

export async function runSync(): Promise<void> {
  const s = useSyncStore.getState()
  if (!client || !s.user || !linkedUserId || s.status === 'accountConflict') return
  if (!navigator.onLine) {
    set({ status: 'offline', online: false })
    return
  }
  if (running) {
    rerun = true
    return
  }
  running = true
  set({ status: 'syncing', error: null, online: true })
  try {
    await syncOnce(db, createSupabaseRemote(client, linkedUserId))
    try {
      await syncGroups(db, createGroupRemote(client))
      set({ groupError: null })
    } catch (e) {
      set({ groupError: errorMessage(e) })
    }
    set({ status: 'idle', lastSyncedAt: Date.now() })
  } catch (e) {
    set({ status: navigator.onLine ? 'error' : 'offline', error: errorMessage(e) })
  } finally {
    running = false
    if (rerun) {
      rerun = false
      scheduleSync(500)
    }
  }
}

export async function signInWithGoogle(redirectPath = '/account'): Promise<void> {
  const c = client ?? (await getSupabase())
  const { error } = await c.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}${redirectPath}` },
  })
  if (error) throw new Error(error.message)
}

/** Group actions that need the server (create, invite, join…). Throws a friendly error when offline or signed out. */
export async function groupsApi(): Promise<GroupApi> {
  const c = client ?? (await getSupabase())
  const { data } = await c.auth.getSession()
  if (!data.session) throw new Error('Sign in with Google first')
  if (!navigator.onLine) throw new Error("You're offline. Connect to the internet and try again.")
  return createGroupApi(c, data.session.user.id)
}

/** Signs out on this device. Local data stays unless asked; the same account picks up where it left off. */
export async function signOut(opts: { removeLocalData: boolean }): Promise<void> {
  if (client) await client.auth.signOut({ scope: 'local' })
  if (opts.removeLocalData) await clearLocalData(db)
}

/**
 * The phone holds data linked to a different Google account.
 *  replace — discard this phone's data and download the signed-in account's data
 *  merge   — keep this phone's data and upload it into the signed-in account
 *  cancel  — sign out again
 */
export async function resolveAccountConflict(choice: 'replace' | 'merge' | 'cancel'): Promise<void> {
  const { user } = useSyncStore.getState()
  if (choice === 'cancel' || !user) {
    await signOut({ removeLocalData: false })
    return
  }
  if (choice === 'replace') {
    await clearLocalData(db)
  } else {
    await db.syncState.delete('lastRev')
    await enqueueAllLocal(db)
  }
  await setSyncState(db, 'userId', user.id)
  await activate(user)
}

export async function redownloadEverything(): Promise<void> {
  await setSyncState(db, 'lastRev', 0)
  await db.groupSyncState.clear()
  await runSync()
}

/** Deletes this account's personal cloud copy and turns sync off on this phone (local data is kept). */
export async function deleteCloudData(): Promise<void> {
  const { user } = useSyncStore.getState()
  if (!client || !user) return
  await deleteCloudRecords(client, user.id)
  await db.syncState.bulkDelete(['userId', 'lastRev', 'lastSyncedAt'])
  await signOut({ removeLocalData: false })
}
