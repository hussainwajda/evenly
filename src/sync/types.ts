export interface RemoteRecordIn {
  table_name: string
  id: string
  data: unknown
  deleted: boolean
  /** Device time of the change, epoch ms. */
  client_updated_at: number
}

export interface RemoteRecord extends RemoteRecordIn {
  /** Server revision, increases with every accepted write. */
  rev: number
}

/** The cloud side of sync. Implemented by Supabase in the app and by an in-memory fake in tests. */
export interface SyncRemote {
  /** Upsert with last-write-wins on client_updated_at. */
  push(records: RemoteRecordIn[]): Promise<void>
  /** Records with rev > sinceRev, ascending by rev. */
  pull(sinceRev: number, limit: number): Promise<RemoteRecord[]>
}
