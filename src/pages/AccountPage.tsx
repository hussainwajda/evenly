import { Cloud, CloudOff, Download, LogIn, LogOut, type LucideIcon, RefreshCw, ShieldCheck, Smartphone, Trash2, WifiOff } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PageHeader, Panel, Section } from '@/components/common'
import { ProfilePanel } from '@/components/groups/ProfilePanel'
import { Avatar } from '@/components/PeoplePicker'
import { describeSync, formatAgo, SYNC_TONE_CLASS } from '@/components/SyncParts'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useNow } from '@/hooks/useData'
import { cn } from '@/lib/utils'
import { deleteCloudData, redownloadEverything, runSync, signInWithGoogle, signOut, useSyncStore } from '@/sync/controller'

const BENEFITS: { icon: LucideIcon; text: string }[] = [
  { icon: WifiOff, text: 'Works offline: everything saves on your phone first' },
  { icon: RefreshCw, text: 'Syncs automatically whenever you’re online' },
  { icon: Smartphone, text: 'Same data on your phone, tablet or laptop' },
  { icon: ShieldCheck, text: 'Only your Google account can read your data' },
]

export function AccountPage() {
  const s = useSyncStore()
  const now = useNow(30_000)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<'signout' | 'delete' | null>(null)
  const [removeLocal, setRemoveLocal] = useState(false)
  const d = describeSync(s, now)

  async function act(fn: () => Promise<void>, success?: string) {
    setBusy(true)
    try {
      await fn()
      if (success) toast.success(success)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Account & sync" backTo="/more" />
      <div className="space-y-6 px-4 pt-2 lg:max-w-3xl">
        {s.status === 'disabled' ? (
          <Panel className="space-y-3">
            <span className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <CloudOff className="size-6" aria-hidden />
            </span>
            <p className="text-lg font-semibold">Cloud sync isn't set up yet</p>
            <p className="text-sm text-muted-foreground">Evenly is working offline and saving everything on this phone. To turn on Google sign-in and sync:</p>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>Create a free Supabase project and run the SQL file in <code className="text-foreground">supabase/migrations</code>.</li>
              <li>Turn on the Google provider in Supabase Authentication.</li>
              <li>
                Put <code className="text-foreground">VITE_SUPABASE_URL</code> and <code className="text-foreground">VITE_SUPABASE_PUBLISHABLE_KEY</code> in{' '}
                <code className="text-foreground">.env.local</code>, then restart or rebuild.
              </li>
            </ol>
            <p className="text-xs text-muted-foreground">Step-by-step guide: SUPABASE_SETUP.md in the project folder.</p>
          </Panel>
        ) : s.status === 'loading' ? (
          <Skeleton className="h-56 rounded-2xl" aria-busy="true" />
        ) : !s.user ? (
          <>
            <Panel className="space-y-5">
              <span className="grid size-14 place-items-center rounded-2xl bg-brand/15 text-brand">
                <Cloud className="size-7" aria-hidden />
              </span>
              <div className="space-y-1">
                <p className="text-lg font-semibold">Back up & sync with Google</p>
                <p className="text-sm text-muted-foreground">Keep a safe copy in the cloud and use Evenly on more than one device.</p>
              </div>
              <ul className="space-y-3 text-sm">
                {BENEFITS.map((b) => (
                  <li key={b.text} className="flex items-start gap-3">
                    <b.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    {b.text}
                  </li>
                ))}
              </ul>
              <Button className="h-12 w-full text-base" disabled={busy || !s.online} onClick={() => void act(signInWithGoogle)}>
                <LogIn aria-hidden /> Continue with Google
              </Button>
              {!s.online ? <p className="text-center text-sm text-warning">Connect to the internet to sign in.</p> : null}
              <p className="text-center text-xs text-muted-foreground">Expenses already on this phone are uploaded after you sign in.</p>
            </Panel>
            {s.error ? (
              <p role="alert" className="px-1 text-sm text-negative">
                {s.error}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <Panel className="flex items-center gap-3">
              {s.user.avatarUrl ? (
                <img src={s.user.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-12 rounded-full object-cover" />
              ) : (
                <Avatar name={s.user.name} className="size-12 text-base" />
              )}
              <div className="min-w-0">
                <p className="truncate font-semibold">{s.user.name}</p>
                <p className="truncate text-sm text-muted-foreground">{s.user.email}</p>
              </div>
            </Panel>

            <ProfilePanel />

            <Section title="Sync">
              <Panel className="space-y-4">
                <p className={cn('flex items-center gap-2 font-medium', SYNC_TONE_CLASS[d.tone])} role="status" aria-live="polite">
                  <d.icon className={cn('size-5 shrink-0', d.spin && 'motion-safe:animate-spin')} aria-hidden />
                  {d.label}
                </p>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Last synced</dt>
                    <dd className="font-medium">{formatAgo(s.lastSyncedAt, now)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Waiting to upload</dt>
                    <dd className="font-medium">
                      {s.pending} {s.pending === 1 ? 'change' : 'changes'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Connection</dt>
                    <dd className="font-medium">{s.online ? 'Online' : 'Offline'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">If two devices clash</dt>
                    <dd className="font-medium">Latest change wins</dd>
                  </div>
                </dl>
                <div className="grid grid-cols-2 gap-2">
                  <Button className="h-11" disabled={busy || !s.online || s.status === 'syncing'} onClick={() => void act(runSync)}>
                    <RefreshCw aria-hidden /> Sync now
                  </Button>
                  <Button
                    variant="secondary"
                    className="h-11"
                    disabled={busy || !s.online || s.status === 'syncing'}
                    onClick={() => void act(redownloadEverything, 'Checked everything against the cloud')}
                  >
                    <Download aria-hidden /> Re-download
                  </Button>
                </div>
              </Panel>
              <p className="px-1 text-xs text-muted-foreground">
                Every change is saved on this phone first and uploaded automatically. Re-download fetches the full cloud copy again if something looks out of date.
              </p>
            </Section>

            <Section title="Account">
              <div className="grid gap-2">
                <Button
                  variant="secondary"
                  className="h-12 justify-start"
                  onClick={() => {
                    setRemoveLocal(false)
                    setConfirm('signout')
                  }}
                >
                  <LogOut aria-hidden /> Sign out
                </Button>
                <Button variant="ghost" className="h-12 justify-start text-negative hover:text-negative" disabled={!s.online} onClick={() => setConfirm('delete')}>
                  <Trash2 aria-hidden /> Delete my cloud data
                </Button>
              </div>
            </Section>
          </>
        )}
      </div>

      <AlertDialog open={confirm === 'signout'} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              {s.pending
                ? `${changes(s.pending)} haven't been uploaded yet. They stay on this phone and upload when you sign back in with the same account.`
                : 'Your cloud copy stays safe. Sign in again any time to keep syncing.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/60 p-3">
            <Label htmlFor="remove-local" className="flex-col items-start gap-0.5">
              <span>Also remove data from this phone</span>
              <span className="text-xs font-normal text-muted-foreground">{s.pending ? 'Changes not yet uploaded will be lost' : 'Useful on a shared device'}</span>
            </Label>
            <Switch id="remove-local" checked={removeLocal} onCheckedChange={setRemoveLocal} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction className="h-11" onClick={() => void act(() => signOut({ removeLocalData: removeLocal }), 'Signed out')}>
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirm === 'delete'} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your cloud data?</AlertDialogTitle>
            <AlertDialogDescription>
              Everything Evenly stored online for {s.user?.email} will be permanently deleted and sync will be turned off. Data on this phone is kept. Other devices keep their own copy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction className="h-11 bg-destructive text-white hover:bg-destructive/90" onClick={() => void act(deleteCloudData, 'Cloud data deleted')}>
              Delete cloud data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function changes(n: number) {
  return `${n} ${n === 1 ? 'change' : 'changes'}`
}
