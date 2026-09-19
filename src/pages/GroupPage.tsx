import { ChevronRight, CircleHelp, Copy, Handshake, LogOut, MoreVertical, Plus, Shuffle, UserPlus, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/CategoryIcon'
import { EmptyState, PageHeader, Panel, Section, Segmented } from '@/components/common'
import { NativeSelect } from '@/components/FormParts'
import { GroupIcon, NetText } from '@/components/groups/GroupIcon'
import { InviteSheet } from '@/components/groups/InviteSheet'
import { paymentStatusLabel } from '@/components/groups/PaymentDetailSheet'
import { Avatar } from '@/components/PeoplePicker'
import { formatAgo } from '@/components/SyncParts'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useCategoryMap, useNow } from '@/hooks/useData'
import { type GroupData, memberLabel, useGroupData } from '@/hooks/useGroups'
import { formatMonthKey, formatShortDate, monthKeyOf } from '@/lib/dates'
import { myRole } from '@/lib/groupMath'
import type { GroupExpense, Settlement } from '@/lib/groupTypes'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useUi } from '@/stores/ui'
import { groupsApi, runSync } from '@/sync/controller'
import { type ActivityItem } from '@/sync/groupRemote'

type Tab = 'expenses' | 'payments' | 'activity' | 'people'

export function GroupPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const data = useGroupData(id)
  const openGroupExpense = useUi((s) => s.openGroupExpense)
  const openSettle = useUi((s) => s.openSettle)
  const openExplain = useUi((s) => s.openExplain)
  const [tab, setTab] = useState<Tab>('expenses')
  const [inviteOpen, setInviteOpen] = useState(params.get('invite') === '1')
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    if (params.get('invite') !== '1') return
    const next = new URLSearchParams(params)
    next.delete('invite')
    setParams(next, { replace: true })
  }, [params, setParams])

  if (data === undefined) {
    return (
      <>
        <PageHeader title="" backTo="/people" />
        <div className="space-y-4 px-4 pt-2 lg:max-w-3xl" aria-busy="true">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </>
    )
  }
  if (data === null) {
    return (
      <>
        <PageHeader title="Group" backTo="/people" />
        <EmptyState
          icon={Users}
          title="This group isn't on this device"
          description="If you just joined or were added, give it a moment to sync."
          action={
            <Button className="h-11" onClick={() => void runSync()}>
              Sync now
            </Button>
          }
        />
      </>
    )
  }

  const myNet = data.meId ? (data.nets.get(data.meId) ?? 0) : 0

  async function toggleSimplify() {
    try {
      const api = await groupsApi()
      await api.updateGroup(data!.group.id, { simplifyDebts: !data!.group.simplifyDebts })
      await runSync()
      toast(data!.group.simplifyDebts ? 'Showing who owes whom directly, for everyone in the group' : 'Debts simplified to the fewest payments, for everyone in the group')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change the setting')
    }
  }

  async function leave() {
    try {
      const api = await groupsApi()
      await api.leaveGroup(data!.group.id)
      await runSync()
      navigate('/people', { replace: true })
      toast(`You left ${data!.group.name}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not leave the group')
    }
  }

  return (
    <>
      <PageHeader
        title={data.group.name}
        subtitle={`${data.activeMembers.length} ${data.activeMembers.length === 1 ? 'person' : 'people'}`}
        backTo="/people"
        actions={
          <>
            <Button variant="secondary" className="h-11 rounded-full" onClick={() => setInviteOpen(true)}>
              <UserPlus aria-hidden /> Invite
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-11 rounded-full" aria-label="Group options">
                  <MoreVertical className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuItem className="min-h-11" onSelect={() => void toggleSimplify()}>
                  <Shuffle aria-hidden /> {data.group.simplifyDebts ? 'Turn off simplify debts' : 'Simplify debts'}
                </DropdownMenuItem>
                <DropdownMenuItem className="min-h-11 text-negative focus:text-negative" onSelect={() => setLeaving(true)}>
                  <LogOut aria-hidden /> Leave group
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="space-y-6 px-4 pt-2 lg:max-w-3xl">
        <Panel className="space-y-4">
          <div className="flex items-center gap-3">
            <GroupIcon kind={data.group.kind} className="size-12" />
            <p className="text-xl">
              <NetText net={myNet} className="[&_.money]:text-2xl" />
            </p>
          </div>
          {data.transfers.length ? (
            <ul className="space-y-2">
              {data.transfers.map((t) => {
                const involvesMe = t.from === data.meId || t.to === data.meId
                const text =
                  t.from === data.meId
                    ? `You owe ${memberLabel(data, t.to)}`
                    : t.to === data.meId
                      ? `${memberLabel(data, t.from)} owes you`
                      : `${memberLabel(data, t.from)} owes ${memberLabel(data, t.to)}`
                return (
                  <li key={`${t.from}>${t.to}`} className="flex min-h-11 items-center gap-2">
                    <button
                      type="button"
                      className="-ml-2 flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded-lg px-2 text-left text-sm transition-colors hover:bg-accent/60 active:bg-accent/60"
                      aria-label={`${text} ${formatINR(t.amount)}. ${data.group.simplifyDebts ? 'Why this amount?' : 'See every bill and payment behind it'}`}
                      onClick={() =>
                        data.group.simplifyDebts
                          ? openExplain({ groupId: data.group.id, from: t.from, to: t.to })
                          : navigate(`/groups/${data.group.id}/with/${t.to}?and=${t.from}`)
                      }
                    >
                      <span className={cn('min-w-0 flex-1', involvesMe ? 'font-medium' : 'text-muted-foreground')}>
                        {text} <span className="money font-semibold">{formatINR(t.amount)}</span>
                      </span>
                      {data.group.simplifyDebts ? (
                        <CircleHelp className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      ) : (
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      )}
                    </button>
                    {involvesMe ? (
                      <Button size="sm" variant="secondary" className="h-10" onClick={() => openSettle({ groupId: data.group.id, from: t.from, to: t.to, amount: t.amount })}>
                        <Handshake aria-hidden /> Settle
                      </Button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{data.expenses.length ? 'Everyone is settled up.' : 'No expenses yet.'}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {data.group.simplifyDebts
              ? 'Simplified to the fewest payments. Tap a balance to see why.'
              : 'Who owes whom directly. Tap a balance to see every bill and payment behind it.'}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button className="h-12" onClick={() => openGroupExpense({ groupId: data.group.id })}>
              <Plus aria-hidden /> Add expense
            </Button>
            <Button variant="secondary" className="h-12" onClick={() => openSettle({ groupId: data.group.id })}>
              <Handshake aria-hidden /> Record payment
            </Button>
          </div>
        </Panel>

        <Segmented<Tab>
          label="Group sections"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'expenses', label: 'Bills' },
            { value: 'payments', label: 'Payments' },
            { value: 'activity', label: 'Activity' },
            { value: 'people', label: 'People' },
          ]}
        />

        {tab === 'expenses' ? (
          <ExpenseFeed data={data} />
        ) : tab === 'payments' ? (
          <PaymentsList data={data} />
        ) : tab === 'activity' ? (
          <ActivityList data={data} />
        ) : (
          <PeopleList data={data} onInvite={() => setInviteOpen(true)} />
        )}
      </div>

      <InviteSheet open={inviteOpen} onOpenChange={setInviteOpen} data={data} />

      <AlertDialog open={leaving} onOpenChange={setLeaving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave {data.group.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {myNet !== 0
                ? `Settle up first: you ${myNet > 0 ? `are owed ${formatINR(myNet)}` : `owe ${formatINR(-myNet)}`} in this group.`
                : 'The group and your share of its expenses will be removed from your devices. You can rejoin with an invite link.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
            {myNet === 0 ? (
              <AlertDialogAction className="h-11 bg-destructive text-white hover:bg-destructive/90" onClick={() => void leave()}>
                Leave group
              </AlertDialogAction>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

type FeedItem = { kind: 'expense'; at: number; expense: GroupExpense } | { kind: 'settlement'; at: number; settlement: Settlement }

function ExpenseFeed({ data }: { data: GroupData }) {
  const categoryMap = useCategoryMap()
  const openGroupDetail = useUi((s) => s.openGroupDetail)
  const openGroupExpense = useUi((s) => s.openGroupExpense)
  const openPaymentDetail = useUi((s) => s.openPaymentDetail)

  const feed = useMemo<FeedItem[]>(
    () =>
      [
        ...data.expenses.map((expense) => ({ kind: 'expense' as const, at: expense.occurredAt, expense })),
        ...data.settlements.map((settlement) => ({ kind: 'settlement' as const, at: settlement.occurredAt, settlement })),
      ].sort((a, b) => b.at - a.at),
    [data.expenses, data.settlements],
  )

  if (!feed.length) {
    return (
      <Panel>
        <EmptyState
          icon={Plus}
          title="No expenses yet"
          description="Add the first one. Everyone's share goes into their own expenses automatically."
          action={
            <Button className="h-11" onClick={() => openGroupExpense({ groupId: data.group.id })}>
              <Plus aria-hidden /> Add expense
            </Button>
          }
        />
      </Panel>
    )
  }

  return (
    <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
      {feed.map((item) => {
        if (item.kind === 'expense') {
          const e = item.expense
          const cat = categoryMap.get(e.categoryId)
          const payer = e.payers.find((p) => p.amount > 0)?.memberId
          const role = myRole(e, data.meId)
          const statuses = data.statuses.get(e.id) ?? []
          const open = statuses.filter((s) => s.state === 'pending' || s.state === 'partial').length
          return (
            <li key={`e-${e.id}`}>
              <button type="button" onClick={() => openGroupDetail(e.id)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-accent/60">
                <CategoryIcon icon={cat?.icon} color={cat?.color} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.title}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {memberLabel(data, payer)} paid {formatINR(e.amount)} · {formatShortDate(e.occurredAt)}
                    {open ? ` · ${open} pending` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right text-sm">
                  {role.lent > 0 ? (
                    <>
                      <p className="text-xs text-muted-foreground">you lent</p>
                      <p className="money font-semibold text-positive">{formatINR(role.lent)}</p>
                    </>
                  ) : role.lent < 0 ? (
                    <>
                      <p className="text-xs text-muted-foreground">you borrowed</p>
                      <p className="money font-semibold text-negative">{formatINR(-role.lent)}</p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">not involved</p>
                  )}
                </div>
              </button>
            </li>
          )
        }
        const s = item.settlement
        const status = paymentStatusLabel(s)
        return (
          <li key={`s-${s.id}`}>
            <button type="button" onClick={() => openPaymentDetail(s.id)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-accent/60">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                <Handshake className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {memberLabel(data, s.from)} paid {memberLabel(data, s.to).replace(/^You$/, 'you')}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {formatShortDate(s.occurredAt)} · {s.method.toUpperCase()} · {status.text.toLowerCase()}
                </p>
              </div>
              <span className={cn('money shrink-0 font-semibold', s.status === 'disputed' && 'text-muted-foreground line-through')}>{formatINR(s.amount)}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function describe(item: ActivityItem, actor: string, name: (memberId: unknown) => string): string {
  const s = item.summary ?? {}
  const title = typeof s.title === 'string' ? `“${s.title}”` : 'an expense'
  const amount = typeof s.amount === 'number' ? ` (${formatINR(s.amount)})` : ''
  const money = typeof s.amount === 'number' ? formatINR(s.amount) : 'a payment'
  const pay = s.from && s.to ? `${money} from ${name(s.from)} to ${name(s.to)}` : `a payment${amount}`
  switch (item.action) {
    case 'group.created':
      return `${actor} created the group`
    case 'group.updated':
      return s.simplify === true
        ? `${actor} turned on simplify debts`
        : s.simplify === false
          ? `${actor} turned off simplify debts`
          : `${actor} changed group settings`
    case 'member.added':
      return `${actor} added ${String(s.name ?? 'someone')}`
    case 'member.joined':
      return `${String(s.name ?? actor)} joined`
    case 'member.left':
      return `${actor} left`
    case 'member.removed':
      return `${actor} removed ${String(s.name ?? 'someone')}`
    case 'expense.created':
      return `${actor} added ${title}${amount}`
    case 'expense.updated':
      return typeof s.prevAmount === 'number' && typeof s.amount === 'number'
        ? `${actor} changed ${title} from ${formatINR(s.prevAmount)} to ${formatINR(s.amount)}`
        : `${actor} edited ${title}${amount}`
    case 'expense.deleted':
      return `${actor} deleted ${title}`
    case 'expense.restored':
      return `${actor} restored ${title}`
    case 'settlement.created':
      return `${actor} recorded ${pay}${s.status === 'confirmed' ? ' (confirmed)' : ''}`
    case 'settlement.updated':
      if (typeof s.prevAmount === 'number' && typeof s.amount === 'number') {
        return `${actor} changed a payment from ${formatINR(s.prevAmount)} to ${formatINR(s.amount)}`
      }
      return s.status === 'confirmed'
        ? `${actor} confirmed receiving ${pay}`
        : s.status === 'disputed'
          ? `${actor} said ${pay} was not received`
          : `${actor} updated ${pay}`
    case 'settlement.deleted':
      return `${actor} deleted ${pay}`
    case 'settlement.restored':
      return `${actor} restored ${pay}`
    default:
      return `${actor} made a change`
  }
}

function ActivityList({ data }: { data: GroupData }) {
  const now = useNow(60_000)
  const openPaymentDetail = useUi((s) => s.openPaymentDetail)
  const openGroupDetail = useUi((s) => s.openGroupDetail)
  const [items, setItems] = useState<ActivityItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const byUser = useMemo(() => new Map(data.members.filter((m) => m.userId).map((m) => [m.userId!, m])), [data.members])
  const changeCount = Math.max(0, ...data.allExpenses.map((e) => e.updatedAt), ...data.allSettlements.map((x) => x.updatedAt))

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const api = await groupsApi()
        const rows = await api.fetchActivity(data.group.id)
        if (!cancelled) {
          setItems(rows)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load activity')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [data.group.id, changeCount])

  if (error) return <p className="px-1 text-sm text-muted-foreground">{error}</p>
  if (!items) return <Skeleton className="h-40 rounded-2xl" />
  if (!items.length) return <p className="px-1 text-sm text-muted-foreground">Nothing here yet.</p>
  return (
    <ul className="divide-y rounded-2xl border bg-card">
      {items.map((item) => {
        const member = item.actor ? byUser.get(item.actor) : undefined
        const actor = member ? (member.id === data.meId ? 'You' : member.displayName) : 'Someone'
        const name = (id: unknown) => (typeof id === 'string' ? memberLabel(data, id).replace(/^You$/, 'you') : 'someone')
        const recordId = item.record_id
        const opens =
          recordId && item.action.startsWith('settlement.')
            ? () => openPaymentDetail(recordId)
            : recordId && item.action.startsWith('expense.') && data.expenses.some((e) => e.id === recordId)
              ? () => openGroupDetail(recordId)
              : null
        const body = (
          <>
            <Avatar name={member?.displayName ?? '?'} className="mt-0.5 size-8 text-xs" />
            <div className="min-w-0 flex-1">
              <p className="text-sm">{describe(item, actor, name)}</p>
              <p className="text-xs text-muted-foreground">{formatAgo(new Date(item.created_at).getTime(), now)}</p>
            </div>
          </>
        )
        if (opens) {
          return (
            <li key={item.id}>
              <button type="button" onClick={opens} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-accent/60">
                {body}
              </button>
            </li>
          )
        }
        return (
          <li key={item.id} className="flex items-start gap-3 px-4 py-3">
            {body}
          </li>
        )
      })}
    </ul>
  )
}

function PeopleList({ data, onInvite }: { data: GroupData; onInvite: () => void }) {
  const navigate = useNavigate()
  return (
    <Section
      action={
        <Button variant="secondary" size="sm" className="h-11 rounded-full" onClick={onInvite}>
          <UserPlus aria-hidden /> Invite
        </Button>
      }
      title="People"
    >
      <p className="px-1 text-sm text-muted-foreground">Each person's overall balance in the group. Tap someone to see every bill and payment between you two.</p>
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {data.activeMembers.map((m) => {
          const net = data.nets.get(m.id) ?? 0
          return (
            <li key={m.id} className="flex min-h-16 items-center gap-1 pr-2">
              <button
                type="button"
                disabled={m.id === data.meId || !data.meId}
                onClick={() => navigate(`/groups/${data.group.id}/with/${m.id}`)}
                aria-label={m.id === data.meId ? undefined : `Statement with ${m.displayName}`}
                className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-4 pr-2 text-left transition-colors enabled:active:bg-accent/60"
              >
              {m.avatarUrl ? (
                <img src={m.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-10 rounded-full object-cover" />
              ) : (
                <Avatar name={m.displayName} className="size-10 text-sm" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {m.displayName}
                  {m.id === data.meId ? ' (you)' : ''}
                  {m.role === 'owner' ? <span className="ml-2 text-xs font-normal text-muted-foreground">Owner</span> : null}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {!m.userId ? 'Not joined yet' : m.upiId ? m.upiId : 'No UPI ID added'}
                </p>
              </div>
              {!m.userId ? <Badge variant="secondary">Pending</Badge> : null}
              <span className={cn('money shrink-0 text-sm font-semibold', net > 0 ? 'text-positive' : net < 0 ? 'text-negative' : 'text-muted-foreground')}>
                {net === 0 ? 'settled' : `${net > 0 ? 'gets' : 'owes'} ${formatINR(Math.abs(net))}`}
              </span>
              {m.id !== data.meId && data.meId ? <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
              </button>
              {m.upiId && m.id !== data.meId ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0 rounded-full"
                  aria-label={`Copy ${m.displayName}'s UPI ID`}
                  onClick={async () => {
                    await navigator.clipboard.writeText(m.upiId!)
                    toast.success('UPI ID copied')
                  }}
                >
                  <Copy className="size-4" aria-hidden />
                </Button>
              ) : null}
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

type PaymentStatusFilter = 'all' | 'recorded' | 'confirmed' | 'disputed' | 'deleted'

function PaymentsList({ data }: { data: GroupData }) {
  const openPaymentDetail = useUi((s) => s.openPaymentDetail)
  const [person, setPerson] = useState('all')
  const [status, setStatus] = useState<PaymentStatusFilter>('all')
  const [month, setMonth] = useState('all')

  const all = useMemo(() => data.allSettlements.slice().sort((a, b) => b.occurredAt - a.occurredAt), [data.allSettlements])
  const months = useMemo(() => [...new Set(all.map((s) => monthKeyOf(s.occurredAt)))].sort().reverse(), [all])
  const list = all.filter(
    (s) =>
      (person === 'all' || s.from === person || s.to === person) &&
      (month === 'all' || monthKeyOf(s.occurredAt) === month) &&
      (status === 'all' ? !s.deletedAt : status === 'deleted' ? Boolean(s.deletedAt) : !s.deletedAt && s.status === status),
  )

  const live = list.filter((s) => !s.deletedAt)
  const settled = live.filter((s) => s.status !== 'disputed').reduce((a, s) => a + s.amount, 0)
  const waiting = live.filter((s) => s.status === 'recorded').length
  const disputed = live.filter((s) => s.status === 'disputed').length

  if (!all.length) {
    return (
      <Panel>
        <EmptyState icon={Handshake} title="No payments yet" description="When someone pays back, record it with Settle up. Every payment and who confirmed it shows here." />
      </Panel>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="pay-person">Person</Label>
          <NativeSelect id="pay-person" value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="all">Everyone</option>
            {data.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === data.meId ? 'You' : m.displayName}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pay-status">Status</Label>
          <NativeSelect id="pay-status" value={status} onChange={(e) => setStatus(e.target.value as PaymentStatusFilter)}>
            <option value="all">All (not deleted)</option>
            <option value="recorded">Waiting for confirmation</option>
            <option value="confirmed">Confirmed</option>
            <option value="disputed">Not received</option>
            <option value="deleted">Deleted</option>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pay-month">Month</Label>
          <NativeSelect id="pay-month" value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="all">All time</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {formatMonthKey(m, true)}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <p className="px-1 text-sm text-muted-foreground">
        {formatINR(settled)} paid back{waiting ? ` · ${waiting} waiting for confirmation` : ''}
        {disputed ? ` · ${disputed} not received` : ''}
      </p>

      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {list.map((s) => {
          const st = paymentStatusLabel(s)
          const recorder = s.createdBy ? memberLabel(data, s.createdBy).replace(/^You$/, 'you') : null
          return (
            <li key={s.id}>
              <button type="button" onClick={() => openPaymentDetail(s.id)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-accent/60">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                  <Handshake className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate font-medium', (s.deletedAt || s.status === 'disputed') && 'line-through')}>
                    {memberLabel(data, s.from)} paid {memberLabel(data, s.to).replace(/^You$/, 'you')}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {formatShortDate(s.occurredAt)} · {s.method.toUpperCase()}
                    {recorder ? ` · recorded by ${recorder}` : ''}
                  </p>
                  <p className={cn('text-sm', st.tone === 'positive' && 'text-positive', st.tone === 'negative' && 'text-negative', st.tone === 'muted' && 'text-muted-foreground')}>
                    {st.text}
                  </p>
                </div>
                <span className="money shrink-0 font-semibold">{formatINR(s.amount)}</span>
              </button>
            </li>
          )
        })}
        {!list.length ? <li className="px-4 py-8 text-center text-sm text-muted-foreground">No payments match these filters.</li> : null}
      </ul>
    </div>
  )
}
