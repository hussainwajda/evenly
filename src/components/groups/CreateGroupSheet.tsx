import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Chip } from '@/components/common'
import { FormSheet } from '@/components/FormParts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { GroupKind } from '@/lib/groupTypes'
import { groupsApi, runSync, useSyncStore } from '@/sync/controller'
import { GROUP_KINDS } from './GroupIcon'

export function CreateGroupSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const user = useSyncStore((s) => s.user)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<GroupKind>('home')
  const [myName, setMyName] = useState(user?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function create() {
    if (!name.trim()) {
      setError('Give the group a name')
      return
    }
    setBusy(true)
    try {
      const api = await groupsApi()
      const id = await api.createGroup(name.trim(), kind, myName.trim() || user?.name || 'Me')
      await runSync()
      onOpenChange(false)
      navigate(`/groups/${id}?invite=1`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the group')
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="New group"
      description="Split bills with flatmates, a trip or friends."
      footer={
        <Button type="submit" form="create-group-form" className="h-12 flex-1 text-base" disabled={busy}>
          {busy ? 'Creating…' : 'Create group'}
        </Button>
      }
    >
      <form
        id="create-group-form"
        className="space-y-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="group-name">Group name</Label>
          <Input
            id="group-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(undefined)
            }}
            placeholder="Flat 402, Goa trip…"
            maxLength={60}
            className="h-12 text-base"
            aria-invalid={Boolean(error)}
          />
          {error ? <p className="text-sm text-negative">{error}</p> : null}
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Type</legend>
          <div className="flex flex-wrap gap-2">
            {GROUP_KINDS.map((k) => (
              <Chip key={k.value} selected={kind === k.value} onClick={() => setKind(k.value)}>
                <k.icon className="size-4" aria-hidden />
                {k.label}
              </Chip>
            ))}
          </div>
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="group-myname">Your name in this group</Label>
          <Input id="group-myname" value={myName} onChange={(e) => setMyName(e.target.value)} maxLength={60} className="h-11" />
          <p className="text-xs text-muted-foreground">Next you'll get an invite link to share on WhatsApp.</p>
        </div>
      </form>
    </FormSheet>
  )
}
