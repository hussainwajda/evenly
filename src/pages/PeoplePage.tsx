import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, Plus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { EmptyState, PageHeader, Panel, Section } from '@/components/common'
import { FriendsSection } from '@/components/groups/FriendsSection'
import { GroupsSection } from '@/components/groups/GroupsSection'
import { Avatar } from '@/components/PeoplePicker'
import { Button } from '@/components/ui/button'
import { db } from '@/db'
import { useBalances, usePeople } from '@/hooks/useData'
import { formatShortDate } from '@/lib/dates'
import { describeBalance, ledgerTotals } from '@/lib/ledger'
import { formatINR } from '@/lib/money'
import type { Person } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useUi } from '@/stores/ui'

export function PeoplePage() {
  const people = usePeople()
  const balances = useBalances()
  const openLedger = useUi((s) => s.openLedger)
  const [showSettled, setShowSettled] = useState(false)
  const lastActivity = useLiveQuery(async () => {
    const map = new Map<string, number>()
    await db.ledger.each((e) => {
      if (!e.deletedAt) map.set(e.personId, Math.max(map.get(e.personId) ?? 0, e.occurredAt))
    })
    return map
  }, [])

  const { owe, owed, settled, totals } = useMemo(() => {
    const owed: Person[] = []
    const owe: Person[] = []
    const settled: Person[] = []
    for (const p of people) {
      const b = balances.get(p.id) ?? 0
      if (b > 0) owed.push(p)
      else if (b < 0) owe.push(p)
      else settled.push(p)
    }
    const byAbs = (a: Person, b: Person) => Math.abs(balances.get(b.id) ?? 0) - Math.abs(balances.get(a.id) ?? 0)
    owed.sort(byAbs)
    owe.sort(byAbs)
    return { owed, owe, settled, totals: ledgerTotals(balances.values()) }
  }, [people, balances])

  const row = (p: Person) => {
    const b = balances.get(p.id) ?? 0
    const state = describeBalance(b)
    const last = lastActivity?.get(p.id)
    return (
      <li key={p.id}>
        <Link to={`/people/${p.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors active:bg-accent/60">
          <Avatar name={p.name} className="size-10 text-sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">
              {p.name}
              {p.archived ? <span className="ml-2 text-xs font-normal text-muted-foreground">Archived</span> : null}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {state === 'owes you' ? 'Owes you' : state === 'you owe' ? 'You owe' : 'Settled up'}
              {last ? ` · ${formatShortDate(last)}` : ''}
            </p>
          </div>
          {b !== 0 ? (
            <span className={cn('money font-semibold', b > 0 ? 'text-positive' : 'text-negative')}>{formatINR(Math.abs(b))}</span>
          ) : null}
        </Link>
      </li>
    )
  }

  return (
    <>
      <PageHeader
        title="Groups & friends"
        subtitle="Shared groups, plus your private lend & borrow ledger"
        actions={
          <Button className="h-11 rounded-full" onClick={() => openLedger()}>
            <Plus aria-hidden /> Entry
          </Button>
        }
      />
      <div className="space-y-6 px-4 pt-2 lg:max-w-3xl">
        <GroupsSection />
        <FriendsSection />

        <div className="space-y-1 px-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Private lend & borrow</h2>
          <p className="text-xs text-muted-foreground">Only you see this. Use a shared group when others should see it too.</p>
        </div>
        <div className="grid grid-cols-2 divide-x divide-border rounded-2xl border bg-card">
          <div className="p-4">
            <p className="text-xs text-muted-foreground">You'll get back</p>
            <p className="text-2xl font-semibold text-positive">{formatINR(totals.owedToMe)}</p>
            <p className="text-xs text-muted-foreground">
              from {owed.length} {owed.length === 1 ? 'person' : 'people'}
            </p>
          </div>
          <div className="p-4">
            <p className="text-xs text-muted-foreground">You owe</p>
            <p className="text-2xl font-semibold text-negative">{formatINR(totals.iOwe)}</p>
            <p className="text-xs text-muted-foreground">
              to {owe.length} {owe.length === 1 ? 'person' : 'people'}
            </p>
          </div>
        </div>

        {people.length === 0 ? (
          <Panel>
            <EmptyState
              icon={Users}
              title="No one here yet"
              description="Record money you lend or borrow, or split a bill when adding an expense."
              action={
                <Button className="h-11" onClick={() => openLedger()}>
                  <Plus aria-hidden /> Add entry
                </Button>
              }
            />
          </Panel>
        ) : null}

        {owed.length ? (
          <Section title="Owe you">
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card">{owed.map(row)}</ul>
          </Section>
        ) : null}

        {owe.length ? (
          <Section title="You owe">
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card">{owe.map(row)}</ul>
          </Section>
        ) : null}

        {settled.length ? (
          <Section>
            <button
              type="button"
              onClick={() => setShowSettled((v) => !v)}
              aria-expanded={showSettled}
              className="flex min-h-11 w-full items-center justify-between px-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Settled ({settled.length})
              <ChevronDown className={cn('size-4 transition-transform', showSettled && 'rotate-180')} aria-hidden />
            </button>
            {showSettled ? <ul className="divide-y overflow-hidden rounded-2xl border bg-card">{settled.map(row)}</ul> : null}
          </Section>
        ) : null}
      </div>
    </>
  )
}
