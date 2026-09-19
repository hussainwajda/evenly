import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight, Handshake, Lock, UserX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/CategoryIcon'
import { EmptyState, PageHeader, Panel, Section, Segmented } from '@/components/common'
import { NativeSelect } from '@/components/FormParts'
import { FriendAvatar } from '@/components/groups/FriendsSection'
import { GroupIcon } from '@/components/groups/GroupIcon'
import { paymentStatusLabel } from '@/components/groups/PaymentDetailSheet'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { db } from '@/db'
import { linkPersonToFriend } from '@/db/repo'
import { useCategoryMap } from '@/hooks/useData'
import { useFriends } from '@/hooks/useGroups'
import { formatShortDate } from '@/lib/dates'
import { type PairRow, pairLedger } from '@/lib/groupMath'
import { LEDGER_LABEL, LEDGER_SIGN, personBalance } from '@/lib/ledger'
import { formatINR } from '@/lib/money'
import type { LedgerEntry } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useUi } from '@/stores/ui'

type Filter = 'all' | 'bills' | 'payments' | 'private'

type Item =
  | { kind: 'group'; at: number; key: string; groupName: string; row: PairRow; names: Map<string, string>; meId: string; memberId: string }
  | { kind: 'private'; at: number; key: string; entry: LedgerEntry }

const balanceText = (name: string, v: number) => (v > 0 ? `${name} owes you ${formatINR(v)}` : v < 0 ? `You owe ${name} ${formatINR(-v)}` : 'All square')

/** Everything between me and one friend: every shared group, plus my private entries for them. */
export function FriendPage() {
  const { userId = '' } = useParams()
  const navigate = useNavigate()
  const friends = useFriends()
  const categoryMap = useCategoryMap()
  const openGroupDetail = useUi((s) => s.openGroupDetail)
  const openPaymentDetail = useUi((s) => s.openPaymentDetail)
  const [filter, setFilter] = useState<Filter>('all')
  const friend = friends?.find((f) => f.userId === userId)

  const people = useLiveQuery(() => db.people.toArray(), [], [])
  const linked = people.find((p) => p.linkedUserId === userId) ?? null
  const privateEntries = useLiveQuery(
    async () => (linked ? (await db.ledger.where('personId').equals(linked.id).toArray()).filter((e) => !e.deletedAt) : []),
    [linked?.id],
    [],
  )

  const groupData = useLiveQuery(async () => {
    if (!friend) return []
    return Promise.all(
      friend.groups.map(async (g) => {
        const [members, expenses, settlements] = await Promise.all([
          db.groupMembers.where('groupId').equals(g.groupId).toArray(),
          db.groupExpenses.where('groupId').equals(g.groupId).toArray(),
          db.groupSettlements.where('groupId').equals(g.groupId).toArray(),
        ])
        const names = new Map(members.map((m) => [m.id, m.id === g.meId ? 'You' : m.displayName]))
        return { g, names, ledger: pairLedger(expenses, settlements, g.meId, g.memberId) }
      }),
    )
  }, [friend])

  const items = useMemo<Item[]>(() => {
    const out: Item[] = []
    for (const { g, names, ledger } of groupData ?? []) {
      for (const row of ledger.rows) {
        if (!row.counts) continue
        out.push({ kind: 'group', at: row.at, key: `${g.groupId}-${row.kind}-${row.id}`, groupName: g.groupName, row, names, meId: g.meId, memberId: g.memberId })
      }
    }
    for (const entry of privateEntries) out.push({ kind: 'private', at: entry.occurredAt, key: `p-${entry.id}`, entry })
    return out
      .filter((i) =>
        filter === 'all'
          ? true
          : filter === 'private'
            ? i.kind === 'private'
            : i.kind === 'group' && (filter === 'bills' ? i.row.kind === 'expense' : i.row.kind === 'settlement'),
      )
      .sort((a, b) => b.at - a.at)
  }, [groupData, privateEntries, filter])

  if (friends === undefined) return <PageHeader title="" backTo="/people" />
  if (!friend) {
    return (
      <>
        <PageHeader title="Friend" backTo="/people" />
        <EmptyState icon={UserX} title="You don't share a group with this person" description="Friends show up here once you're both in a shared group." />
      </>
    )
  }

  const privateBalance = personBalance(privateEntries)
  const first = friend.name.split(/\s+/)[0]

  return (
    <>
      <PageHeader title={friend.name} subtitle={`${friend.groups.length} shared ${friend.groups.length === 1 ? 'group' : 'groups'}`} backTo="/people" />
      <div className="space-y-6 px-4 pt-2 lg:max-w-3xl">
        <Panel className="space-y-4">
          <div className="flex items-center gap-3">
            <FriendAvatar friend={friend} className="size-12 text-base" />
            <div className="min-w-0">
              <p className={cn('text-xl font-semibold', friend.total > 0 ? 'text-positive' : friend.total < 0 ? 'text-negative' : '')}>
                {balanceText(first, friend.total)}
              </p>
              <p className="text-sm text-muted-foreground">Across shared groups, bill by bill (not simplified)</p>
            </div>
          </div>
          {linked ? (
            <dl className="space-y-1.5 border-t pt-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Shared groups</dt>
                <dd className="money">{friend.total ? formatINR(friend.total, { signed: true }) : '₹0'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="flex items-center gap-1 text-muted-foreground">
                  <Lock className="size-3.5" aria-hidden /> Private entries
                </dt>
                <dd className="money">{privateBalance ? formatINR(privateBalance, { signed: true }) : '₹0'}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t pt-1.5 font-semibold">
                <dt>Everything together</dt>
                <dd>{balanceText(first, friend.total + privateBalance)}</dd>
              </div>
              <p className="pt-1 text-xs text-muted-foreground">+ means {first} owes you. Private entries are only on your devices; {first} can't see them.</p>
            </dl>
          ) : null}
        </Panel>

        <Section title="Shared groups">
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {friend.groups.map((g) => (
              <li key={g.groupId}>
                <Link
                  to={`/groups/${g.groupId}/with/${g.memberId}`}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40 active:bg-accent/60"
                >
                  <GroupIcon kind={g.kind} className="size-10" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{g.groupName}</p>
                    <p className="truncate text-sm text-muted-foreground">{balanceText(first, g.balance)}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">Statement</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Private entries">
          <Panel className="space-y-3">
            <p className="flex gap-2 text-sm text-muted-foreground">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
              Link {first} to someone in your private lend & borrow list to see those entries here too. They stay private.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1 space-y-1.5">
                <Label htmlFor="friend-link">Private entry</Label>
                <NativeSelect
                  id="friend-link"
                  value={linked?.id ?? ''}
                  onChange={async (e) => {
                    await linkPersonToFriend(e.target.value || null, userId)
                    toast(e.target.value ? 'Linked' : 'Unlinked')
                  }}
                >
                  <option value="">Not linked</option>
                  {people
                    .filter((p) => !p.archived || p.id === linked?.id)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.linkedUserId && p.linkedUserId !== userId ? ' (linked to someone else)' : ''}
                      </option>
                    ))}
                </NativeSelect>
              </div>
              {linked ? (
                <Button variant="secondary" className="h-11" onClick={() => navigate(`/people/${linked.id}`)}>
                  Open {linked.name}
                </Button>
              ) : null}
            </div>
          </Panel>
        </Section>

        <Section title="Everything between you">
          <Segmented<Filter>
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'bills', label: 'Bills' },
              { value: 'payments', label: 'Payments' },
              ...(linked ? [{ value: 'private' as const, label: 'Private' }] : []),
            ]}
          />
          <p className="px-1 text-xs text-muted-foreground">Newest first. + means {first} owes you more, − means less.</p>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {items.map((item) => {
              if (item.kind === 'private') {
                const e = item.entry
                const delta = LEDGER_SIGN[e.type] * e.amount
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => navigate(`/people/${e.personId}`)}
                      className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-accent/60"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                        <Lock className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{LEDGER_LABEL[e.type]}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {formatShortDate(e.occurredAt)} · private{e.note ? ` · ${e.note}` : ''}
                        </p>
                      </div>
                      <span className={cn('money shrink-0 font-semibold', delta > 0 ? 'text-positive' : 'text-negative')}>{formatINR(delta, { signed: true })}</span>
                    </button>
                  </li>
                )
              }
              const { row, names } = item
              const n = (id: string) => names.get(id) ?? 'Someone'
              if (row.kind === 'expense') {
                const e = row.expense!
                const cat = categoryMap.get(e.categoryId)
                const payers = e.payers.filter((p) => p.amount > 0).map((p) => n(p.memberId))
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => openGroupDetail(e.id)}
                      className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-accent/60"
                    >
                      <CategoryIcon icon={cat?.icon} color={cat?.color} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{e.title}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {item.groupName} · {payers.join(' & ')} paid {formatINR(e.amount)} · {formatShortDate(e.occurredAt)}
                        </p>
                      </div>
                      <span className={cn('money shrink-0 font-semibold', row.delta > 0 ? 'text-positive' : 'text-negative')}>{formatINR(row.delta, { signed: true })}</span>
                    </button>
                  </li>
                )
              }
              const s = row.settlement!
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => openPaymentDetail(s.id)}
                    className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-accent/60"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                      <Handshake className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {n(s.from)} paid {n(s.to) === 'You' ? 'you' : n(s.to)}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {item.groupName} · {formatShortDate(s.occurredAt)} · {paymentStatusLabel(s).text.toLowerCase()}
                      </p>
                    </div>
                    <span className={cn('money shrink-0 font-semibold', row.delta > 0 ? 'text-positive' : 'text-negative')}>{formatINR(row.delta, { signed: true })}</span>
                  </button>
                </li>
              )
            })}
            {!items.length ? <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing here yet.</li> : null}
          </ul>
        </Section>
      </div>
    </>
  )
}
