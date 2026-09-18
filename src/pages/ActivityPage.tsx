import { ReceiptText, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { CategoryIcon } from '@/components/CategoryIcon'
import { CategoryBreakdown } from '@/components/CategoryBreakdown'
import { Chip, EmptyState, MonthSwitcher, Panel } from '@/components/common'
import { TransactionRow } from '@/components/TransactionRow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useCategoryMap, usePaymentMethodMap, usePeopleMap, useRecurring, useSelectedMonth, useTransactions } from '@/hooks/useData'
import { dayAnchorId, formatDayHeader, startOfDay } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { monthStats } from '@/lib/stats'
import type { Transaction } from '@/lib/types'
import { useUi } from '@/stores/ui'

export function ActivityPage() {
  const { monthKey, currentMonthKey, range, now } = useSelectedMonth()
  const txns = useTransactions(range)
  const categoryMap = useCategoryMap()
  const pmMap = usePaymentMethodMap()
  const peopleMap = usePeopleMap()
  const recurring = useRecurring()
  const openExpense = useUi((s) => s.openExpense)
  const openGroupDetail = useUi((s) => s.openGroupDetail)
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const categoryFilter = params.get('category')
  const [query, setQuery] = useState('')

  const monthCategories = useMemo(() => {
    const ids = new Set((txns ?? []).map((t) => t.categoryId))
    if (categoryFilter) ids.add(categoryFilter)
    return [...ids].map((id) => categoryMap.get(id)).filter((c) => c != null).sort((a, b) => a.order - b.order)
  }, [txns, categoryMap, categoryFilter])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (txns ?? [])
      .filter((t) => !categoryFilter || t.categoryId === categoryFilter)
      .filter((t) => !q || t.nameLower.includes(q) || t.note.toLowerCase().includes(q))
      .sort((a, b) => b.occurredAt - a.occurredAt)
    const map = new Map<number, Transaction[]>()
    for (const t of list) {
      const day = startOfDay(t.occurredAt)
      const arr = map.get(day)
      if (arr) arr.push(t)
      else map.set(day, [t])
    }
    return [...map.entries()].map(([day, items]) => ({
      day,
      items,
      total: items.reduce((a, t) => a + (t.excludeFromSpend ? 0 : t.amount), 0),
    }))
  }, [txns, categoryFilter, query])

  // Desktop side panel: the whole month, regardless of search or category filter.
  const summary = useMemo(
    () => (txns ? monthStats({ transactions: txns, budget: null, range, now, recurring, monthKey }) : null),
    [txns, range, now, recurring, monthKey],
  )

  const total = groups.reduce((a, g) => a + g.total, 0)
  const count = groups.reduce((a, g) => a + g.items.length, 0)

  // Jump to a day when arriving from the Home chart.
  useEffect(() => {
    if (!location.hash || !groups.length) return
    const el = document.getElementById(location.hash.slice(1))
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }, [location.hash, groups.length])

  function setCategory(id: string | null) {
    const next = new URLSearchParams(params)
    if (id) next.set('category', id)
    else next.delete('category')
    setParams(next, { replace: true })
  }

  return (
    <>
      <header className="pt-safe sticky top-0 z-30 space-y-2 bg-background/90 pb-2 backdrop-blur-lg">
        <div className="flex h-14 items-center justify-between gap-2 pl-4 pr-2">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold leading-tight">Activity</h1>
            <p className="truncate text-xs text-muted-foreground">
              {txns ? `${count} ${count === 1 ? 'expense' : 'expenses'} · ${formatINR(total)}` : 'Loading…'}
            </p>
          </div>
          <MonthSwitcher monthKey={monthKey} currentMonthKey={currentMonthKey} />
        </div>
        <div className="relative px-4">
          <Search className="pointer-events-none absolute left-7 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search expenses"
            aria-label="Search expenses"
            className="h-11 rounded-full pl-9"
          />
        </div>
        {monthCategories.length > 1 || categoryFilter ? (
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-4" role="group" aria-label="Filter by category">
            <Chip selected={!categoryFilter} onClick={() => setCategory(null)}>
              All
            </Chip>
            {monthCategories.map((c) => (
              <Chip key={c.id} selected={categoryFilter === c.id} onClick={() => setCategory(categoryFilter === c.id ? null : c.id)} className="pl-1.5">
                <CategoryIcon icon={c.icon} color={c.color} className="size-6 [&_svg]:size-3.5" />
                {c.name}
              </Chip>
            ))}
          </div>
        ) : null}
      </header>

      <div className="px-4 pt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-6">
        <div className="space-y-5">
        {!txns ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={query || categoryFilter ? Search : ReceiptText}
            title={query || categoryFilter ? 'No matching expenses' : 'No expenses this month'}
            description={query || categoryFilter ? 'Try a different search or filter.' : 'Tap + to add your first one.'}
            action={
              query || categoryFilter ? (
                <Button
                  variant="secondary"
                  className="h-11"
                  onClick={() => {
                    setQuery('')
                    setCategory(null)
                  }}
                >
                  <X aria-hidden /> Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          groups.map((g) => {
            const id = dayAnchorId(g.day)
            return (
              <section key={g.day} id={id} aria-labelledby={`${id}-h`} className="scroll-mt-40">
                <div className="flex items-baseline justify-between px-1 pb-2">
                  <h2 id={`${id}-h`} className="text-sm font-semibold">
                    {formatDayHeader(g.day, now)}
                  </h2>
                  <span className="money text-sm text-muted-foreground">{formatINR(g.total)}</span>
                </div>
                <div className="divide-y overflow-hidden rounded-2xl border bg-card">
                  {g.items.map((t) => (
                    <TransactionRow
                      key={t.id}
                      txn={t}
                      category={categoryMap.get(t.categoryId)}
                      method={t.paymentMethodId ? pmMap.get(t.paymentMethodId) : undefined}
                      peopleMap={peopleMap}
                      onClick={() => (t.groupExpenseId ? openGroupDetail(t.groupExpenseId) : openExpense({ editId: t.id }))}
                    />
                  ))}
                </div>
              </section>
            )
          })
        )}
        </div>

        {summary && summary.count > 0 ? (
          <aside className="hidden lg:sticky lg:top-44 lg:block" aria-label="Month summary">
            <Panel className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Spent this month</p>
                <p className="text-2xl font-semibold">{formatINR(summary.spent)}</p>
                <p className="text-sm text-muted-foreground">
                  {summary.count} expenses · {formatINR(summary.dailyAverage)} a day on everyday spending
                </p>
              </div>
              <CategoryBreakdown
                items={summary.byCategory}
                categoryMap={categoryMap}
                totalSpent={summary.spent}
                onSelect={(id) => setCategory(categoryFilter === id ? null : id)}
                initial={8}
              />
            </Panel>
          </aside>
        ) : null}
      </div>
    </>
  )
}
