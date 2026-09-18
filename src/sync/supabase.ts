import type { SupabaseClient } from '@supabase/supabase-js'
import type { RemoteRecord, SyncRemote } from './types'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim()

/** False when the build has no Supabase settings — the app then runs local-only. */
export const isCloudConfigured = Boolean(url && key)

let clientPromise: Promise<SupabaseClient> | null = null

/** Loads supabase-js on demand so local-only use doesn't pay for it. */
export function getSupabase(): Promise<SupabaseClient> {
  if (!isCloudConfigured) return Promise.reject(new Error('Cloud sync is not configured'))
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url!, key!, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'kharcha-auth',
      },
    }),
  )
  return clientPromise
}

export function createSupabaseRemote(client: SupabaseClient, userId: string): SyncRemote {
  return {
    async push(records) {
      const { error } = await client.rpc('kharcha_push', { records })
      if (error) throw new Error(error.message)
    },
    async pull(sinceRev, limit) {
      const { data, error } = await client
        .from('kharcha_records')
        .select('table_name, id, data, deleted, client_updated_at, rev')
        .eq('user_id', userId)
        .gt('rev', sinceRev)
        .order('rev', { ascending: true })
        .limit(limit)
      if (error) throw new Error(error.message)
      return (data ?? []).map(
        (r): RemoteRecord => ({
          table_name: r.table_name,
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

export async function deleteCloudRecords(client: SupabaseClient, userId: string): Promise<void> {
  const { error } = await client.from('kharcha_records').delete().eq('user_id', userId)
  if (error) throw new Error(error.message)
}
