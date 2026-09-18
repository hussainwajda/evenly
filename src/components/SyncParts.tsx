import { CloudAlert, CloudCheck, CloudOff, type LucideIcon, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useNow } from '@/hooks/useData'
import { cn } from '@/lib/utils'
import { resolveAccountConflict, type SyncState, useSyncStore } from '@/sync/controller'

export type SyncTone = 'muted' | 'positive' | 'warning' | 'negative'

export const SYNC_TONE_CLASS: Record<SyncTone, string> = {
  muted: 'text-muted-foreground',
  positive: 'text-positive',
  warning: 'text-warning',
  negative: 'text-negative',
}

export function formatAgo(ms: number | null, now: number): string {
  if (!ms) return 'Not yet'
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 45) return 'Just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(ms)
}

const changes = (n: number) => `${n} ${n === 1 ? 'change' : 'changes'}`

export function describeSync(s: SyncState, now: number): { label: string; tone: SyncTone; icon: LucideIcon; spin: boolean } {
  switch (s.status) {
    case 'disabled':
      return { label: 'Cloud sync not set up', tone: 'muted', icon: CloudOff, spin: false }
    case 'loading':
      return { label: 'Checking your account…', tone: 'muted', icon: RefreshCw, spin: true }
    case 'signedOut':
      return { label: 'Not signed in · saved on this phone only', tone: 'muted', icon: CloudOff, spin: false }
    case 'syncing':
      return { label: 'Syncing…', tone: 'muted', icon: RefreshCw, spin: true }
    case 'offline':
      return {
        label: s.pending ? `Offline · ${changes(s.pending)} will sync later` : 'Offline · everything is saved on this phone',
        tone: 'warning',
        icon: CloudOff,
        spin: false,
      }
    case 'error':
      return { label: `Sync paused · ${s.error ?? 'unknown error'}`, tone: 'negative', icon: CloudAlert, spin: false }
    case 'accountConflict':
      return { label: 'Choose which data to keep', tone: 'warning', icon: CloudAlert, spin: false }
    case 'idle':
      if (s.pending) return { label: `${changes(s.pending)} waiting to sync`, tone: 'muted', icon: RefreshCw, spin: false }
      return {
        label: s.lastSyncedAt ? `Synced ${formatAgo(s.lastSyncedAt, now).toLowerCase()}` : 'Signed in',
        tone: 'positive',
        icon: CloudCheck,
        spin: false,
      }
  }
}

/** Small header icon showing sync state; hidden when sync is off or signed out. */
export function SyncStatusButton() {
  const s = useSyncStore()
  const now = useNow(30_000)
  if (s.status === 'disabled' || s.status === 'signedOut') return null
  const d = describeSync(s, now)
  return (
    <Button asChild variant="ghost" size="icon" className="relative size-11 rounded-full">
      <Link to="/account" aria-label={`Sync status: ${d.label}`}>
        <d.icon className={cn('size-5', SYNC_TONE_CLASS[d.tone], d.spin && 'motion-safe:animate-spin')} aria-hidden />
        {s.pending > 0 && s.status !== 'syncing' ? (
          <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-warning ring-2 ring-background" aria-hidden />
        ) : null}
      </Link>
    </Button>
  )
}

/** Shown when this phone's data belongs to a different Google account than the one that just signed in. */
export function AccountConflictDialog() {
  const status = useSyncStore((s) => s.status)
  const email = useSyncStore((s) => s.user?.email)
  const pending = useSyncStore((s) => s.pending)
  const [busy, setBusy] = useState(false)

  async function choose(choice: 'replace' | 'merge' | 'cancel') {
    setBusy(true)
    try {
      await resolveAccountConflict(choice)
      if (choice === 'replace') toast.success('Downloading your cloud data')
      if (choice === 'merge') toast.success("Uploading this phone's data to your account")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AlertDialog open={status === 'accountConflict'}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>This phone has another account's data</AlertDialogTitle>
          <AlertDialogDescription>
            You signed in as {email}, but the data on this phone was synced with a different Google account
            {pending ? `, and ${changes(pending)} haven't been uploaded` : ''}. What should Evenly do?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2">
          <Button className="h-auto min-h-12 whitespace-normal py-3" disabled={busy} onClick={() => void choose('replace')}>
            Replace with this account's cloud data
          </Button>
          <Button variant="secondary" className="h-auto min-h-12 whitespace-normal py-3" disabled={busy} onClick={() => void choose('merge')}>
            Add this phone's data to this account
          </Button>
          <Button variant="ghost" className="h-11" disabled={busy} onClick={() => void choose('cancel')}>
            Sign out instead
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
