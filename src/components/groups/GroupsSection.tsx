import { Plus, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { EmptyState, Panel, Section } from '@/components/common'
import { Avatar } from '@/components/PeoplePicker'
import { Button } from '@/components/ui/button'
import { type GroupSummary, useGroupSummaries } from '@/hooks/useGroups'
import { useSyncStore } from '@/sync/controller'
import { CreateGroupSheet } from './CreateGroupSheet'
import { GroupIcon, NetText } from './GroupIcon'

function GroupCard({ summary }: { summary: GroupSummary }) {
  const { group, members, myNet, expenseCount } = summary
  return (
    <Link
      to={`/groups/${group.id}`}
      className="flex min-h-20 items-center gap-3 rounded-2xl border bg-card p-4 transition-colors hover:bg-accent/40 active:bg-accent/60"
    >
      <GroupIcon kind={group.kind} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{group.name}</p>
        <p className="truncate text-sm">
          <NetText net={myNet} />
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {members.length} {members.length === 1 ? 'person' : 'people'} · {expenseCount} {expenseCount === 1 ? 'expense' : 'expenses'}
        </p>
      </div>
      <div className="hidden -space-x-2 sm:flex" aria-hidden>
        {members.slice(0, 3).map((m) => (
          <Avatar key={m.id} name={m.displayName} className="size-7 text-[11px] ring-2 ring-card" />
        ))}
      </div>
    </Link>
  )
}

export function GroupsSection() {
  const sync = useSyncStore()
  const groups = useGroupSummaries()
  const [createOpen, setCreateOpen] = useState(false)
  const [session, setSession] = useState(0)

  if (sync.status === 'disabled') return null

  const openCreate = () => {
    setSession((n) => n + 1)
    setCreateOpen(true)
  }

  return (
    <Section
      title="Shared groups"
      action={
        sync.user ? (
          <Button size="sm" className="h-11 rounded-full" onClick={openCreate}>
            <Plus aria-hidden /> New group
          </Button>
        ) : undefined
      }
    >
      {!sync.user && !groups?.length ? (
        <Panel className="flex items-center gap-3">
          <Users className="size-5 shrink-0 text-brand" aria-hidden />
          <p className="min-w-0 flex-1 text-sm">Sign in with Google to create groups and split bills with friends.</p>
          <Button asChild size="sm" variant="secondary" className="h-11">
            <Link to="/account">Sign in</Link>
          </Button>
        </Panel>
      ) : groups?.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => (
            <GroupCard key={g.group.id} summary={g} />
          ))}
        </div>
      ) : groups ? (
        <Panel>
          <EmptyState
            icon={Users}
            title="No groups yet"
            description="Create one for your flat, a trip or friends, then share the invite link. Everyone's share is added to their own expenses automatically."
            action={
              <Button className="h-11" onClick={openCreate}>
                <Plus aria-hidden /> New group
              </Button>
            }
          />
        </Panel>
      ) : null}
      {sync.groupError ? (
        <p className="px-1 text-sm text-negative" role="alert">
          {sync.groupError}
        </p>
      ) : null}
      <CreateGroupSheet key={session} open={createOpen} onOpenChange={setCreateOpen} />
    </Section>
  )
}
