import { LogIn, TriangleAlert, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { Chip, PageHeader, Panel } from '@/components/common'
import { GroupIcon } from '@/components/groups/GroupIcon'
import { Avatar } from '@/components/PeoplePicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { groupsApi, runSync, signInWithGoogle, useSyncStore } from '@/sync/controller'
import type { InvitePreview } from '@/sync/groupRemote'

export function JoinPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const sync = useSyncStore()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [claim, setClaim] = useState<string>('new')
  const [name, setName] = useState(sync.user?.name ?? '')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!sync.user) return
    if (!name) setName(sync.user.name)
    let cancelled = false
    void (async () => {
      try {
        const api = await groupsApi()
        const p = await api.previewInvite(token)
        if (!cancelled) setPreview(p)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'This invite link is not valid')
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync.user?.id, token])

  async function join() {
    if (!preview || !sync.user) return
    setBusy(true)
    try {
      const api = await groupsApi()
      const groupId = await api.joinGroup(token, claim === 'new' ? null : claim, name.trim() || sync.user.name)
      await runSync()
      toast.success(`You joined ${preview.name}`)
      navigate(`/groups/${groupId}`, { replace: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not join')
    } finally {
      setBusy(false)
    }
  }

  const placeholders = preview?.members.filter((m) => m.placeholder) ?? []

  return (
    <>
      <PageHeader title="Join a group" />
      <div className="space-y-6 px-4 pt-2 lg:max-w-3xl">
        {sync.status === 'disabled' ? (
          <Panel className="text-sm">This copy of Evenly isn't connected to the cloud, so it can't join shared groups.</Panel>
        ) : sync.status === 'loading' ? (
          <Skeleton className="h-48 rounded-2xl" aria-busy="true" />
        ) : !sync.user ? (
          <Panel className="space-y-4 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand/15 text-brand">
              <Users className="size-7" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="text-lg font-semibold">You're invited to a group</p>
              <p className="text-sm text-muted-foreground">Sign in with Google to see the group and join it.</p>
            </div>
            <Button className="h-12 w-full" disabled={!sync.online} onClick={() => void signInWithGoogle(`/join/${token}`)}>
              <LogIn aria-hidden /> Continue with Google
            </Button>
          </Panel>
        ) : error ? (
          <Panel className="space-y-3">
            <p className="flex items-start gap-2 text-sm text-negative" role="alert">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
            </p>
            <Button asChild variant="secondary" className="h-11">
              <Link to="/people">Go to your groups</Link>
            </Button>
          </Panel>
        ) : !preview ? (
          <Skeleton className="h-48 rounded-2xl" aria-busy="true" />
        ) : (
          <Panel className="space-y-5">
            <div className="flex items-center gap-3">
              <GroupIcon kind={preview.kind} className="size-12" />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{preview.name}</p>
                <p className="text-sm text-muted-foreground">
                  {preview.members.length} {preview.members.length === 1 ? 'person' : 'people'}:{' '}
                  {preview.members.map((m) => m.display_name).join(', ')}
                </p>
              </div>
            </div>

            {preview.already_member ? (
              <Button className="h-12 w-full" onClick={() => navigate(`/groups/${preview.group_id}`, { replace: true })}>
                You're already in. Open group
              </Button>
            ) : (
              <>
                {placeholders.length ? (
                  <fieldset className="space-y-2">
                    <legend className="mb-1 text-sm font-medium">Are you one of these people?</legend>
                    <p className="text-xs text-muted-foreground">Pick your name to take over the expenses already split with you.</p>
                    <div className="flex flex-wrap gap-2">
                      {placeholders.map((m) => (
                        <Chip key={m.id} selected={claim === m.id} onClick={() => setClaim(m.id)} className="pl-1.5" role="radio" aria-checked={claim === m.id}>
                          <Avatar name={m.display_name} />
                          {m.display_name}
                        </Chip>
                      ))}
                      <Chip selected={claim === 'new'} onClick={() => setClaim('new')} role="radio" aria-checked={claim === 'new'}>
                        No, I'm new
                      </Chip>
                    </div>
                  </fieldset>
                ) : null}
                {claim === 'new' ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="join-name">Your name in this group</Label>
                    <Input id="join-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="h-11" />
                  </div>
                ) : null}
                <Button className="h-12 w-full text-base" disabled={busy} onClick={() => void join()}>
                  {busy ? 'Joining…' : `Join ${preview.name}`}
                </Button>
                <p className="text-center text-xs text-muted-foreground">Group members will see your name and the expenses you add to this group. Your personal expenses stay private.</p>
              </>
            )}
          </Panel>
        )}
      </div>
    </>
  )
}
