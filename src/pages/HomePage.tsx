import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CloudUpload,
  FileSpreadsheet,
  type LucideIcon,
  OctagonAlert,
  Plus,
  ReceiptText,
  Settings2,
  Target,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { CategoryBreakdown } from '@/components/CategoryBreakdown'
import { BudgetRing, DailyBars, type MeterState, PaceChart, useChartColors } from '@/components/charts'
import { EmptyState, MonthSwitcher, Panel, Section } from '@/components/common'
import { SyncStatusButton } from '@/components/SyncParts'
import { TransactionRow } from '@/components/TransactionRow'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { db } from '@/db'
import { addRecurringForMonth, dueRecurring, skipRecurringForMonth } from '@/db/repo'
import {
  useBalances,
  useBudget,
  useCategoryMap,
  useLedger,
  usePaymentMethodMap,
  usePeopleMap,
  useRecurring,
  useSelectedMonth,
  useSettings,
  useTransactions,
} from '@/hooks/useData'
import { addMonths, cycleDayLabel, cycleDayStart, dayAnchorId, dayIndexInRange, formatMonthKey, monthRange } from '@/lib/dates'
import { ledgerTotals } from '@/lib/ledger'
import { formatINR } from '@/lib/money'
import { type MonthStats, monthStats, PAID_BY_FRIEND, spentThroughDay } from '@/lib/stats'
import { cn } from '@/lib/utils'
import { useUi } from '@/stores/ui'

const TONE = { positive: 'text-positive', negative: 'text-negative', warning: 'text-warning' } as const

function meterState(stats: MonthStats): MeterState {
  if (stats.percentUsed == null) return 'good'
  if (stats.percentUsed > 1) return 'critical'
  if (stats.percentUsed >= 0.8) return 'warning'
  return 'good'
}

function budgetStatus(stats: MonthStats): { tone: keyof typeof TONE; label: string; icon: LucideIcon } | null {
  if (stats.budgetTotal == null) return null
  if (stats.spent > stats.budgetTotal) {
    return { tone: 'negative', label: `Over budget by ${formatINR(stats.spent - stats.budgetTotal)}`, icon: OctagonAlert }
  }
  if (stats.status === 'past') return { tone: 'positive', label: 'Stayed within budget', icon: CheckCircle2 }
  if ((stats.percentUsed ?? 0) >= 0.8) return { tone: 'warning', label: 'Close to your limit', icon: TriangleAlert }
  if (stats.projected != null && stats.projected > stats.budgetTotal) {
    return { tone: 'warning', label: `At this pace you'll spend ${formatINR(stats.projected)}`, icon: TrendingUp }
  }
  return { tone: 'positive', label: 'On track', icon: CheckCircle2 }
}

function Tile({ label, value, tone }: { label: string; value: ReactNode; tone?: keyof typeof TONE }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className={cn('truncate text-base font-semibold', tone && TONE[tone])}>{value}</p>
    </div>
  )
}

export function HomePage() {
  const navigate = useNavigate()
  const { monthKey, currentMonthKey, isCurrent, range, now, startDay } = useSelectedMonth()
  const settings = useSettings()
  const openExpense = useUi((s) => s.openExpense)
  const openGroupDetail = useUi((s) => s.openGroupDetail)
  const c = useChartColors()

  const txns = useTransactions(range)
  const prevKey = addMonths(monthKey, -1)
  const prevRange = useMemo(() => monthRange(prevKey, startDay), [prevKey, startDay])
  const prevTxns = useTransactions(prevRange)
  const budget = useBudget(monthKey)
  const ledger = useLedger()
  const balances = useBalances()
  const categoryMap = useCategoryMap()
  const pmMap = usePaymentMethodMap()
  const peopleMap = usePeopleMap()
  const recurring = useRecurring()
  const totalCount = useLiveQuery(() => db.transactions.count(), [], -1)

  const stats = useMemo(
    () => (txns && budget !== undefined ? monthStats({ transactions: txns, ledger, budget, range, now, recurring, monthKey }) : null),
    [txns, ledger, budget, range, now, recurring, monthKey],
  )

  const header = (
    <header className="pt-safe sticky top-0 z-30 bg-background/85 backdrop-blur-lg">
      <div className="flex h-14 items-center justify-between px-2">
        <MonthSwitcher monthKey={monthKey} currentMonthKey={currentMonthKey} />
        <div className="flex items-center">
          <SyncStatusButton />
          <Button asChild variant="ghost" size="icon" className="size-11 rounded-full">
            <Link to="/settings" aria-label="Settings">
              <Settings2 className="size-5" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  )

  if (!stats) {
    return (
      <>
        {header}
        <div className="space-y-4 px-4 pt-2" aria-busy="true">
          <Skeleton className="h-52 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </>
    )
  }

  const status = budgetStatus(stats)
  const todayIndex = stats.status === 'current' ? dayIndexInRange(now, range) : -1
  const compareIndex = stats.status === 'current' ? todayIndex : range.days - 1
  const prevSpent = prevTxns ? spentThroughDay(prevTxns, prevRange, Math.min(compareIndex, prevRange.days - 1)) : null
  const due = isCurrent ? dueRecurring(recurring, monthKey, now) : []
  const people = ledgerTotals(balances.values())
  const recent = [...(txns ?? [])].sort((a, b) => b.occurredAt - a.occurredAt).slice(0, 5)
  const showWelcome = totalCount === 0 && budget === null
  const backupDue = totalCount >= 20 && (!settings.lastBackupAt || now - settings.lastBackupAt > 7 * 86_400_000)
  const maxMethod = Math.max(1, ...stats.byPaymentMethod.map((m) => m.amount))

  return (
    <>
      {header}
      <div className="space-y-6 px-4 pt-2 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6 lg:space-y-0">
        {showWelcome ? (
          <Panel className="space-y-3 lg:order-first lg:col-span-12">
            <div>
              <p className="text-lg font-semibold">Welcome to Evenly</p>
              <p className="text-sm text-muted-foreground">Three quick steps to replace your spreadsheet.</p>
            </div>
            <div className="grid gap-2">
              <Button asChild variant="secondary" className="h-12 justify-start">
                <Link to="/budget">
                  <Target aria-hidden /> Set a monthly budget
                </Link>
              </Button>
              <Button asChild variant="secondary" className="h-12 justify-start">
                <Link to="/import">
                  <FileSpreadsheet aria-hidden /> Import your Excel history
                </Link>
              </Button>
              <Button variant="secondary" className="h-12 justify-start" onClick={() => openExpense()}>
                <Plus aria-hidden /> Add your first expense
              </Button>
            </div>
          </Panel>
        ) : null}

        {/* Budget hero */}
        <Panel className="space-y-4 lg:col-span-5 lg:row-span-2">
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm text-muted-foreground">{stats.status === 'current' ? 'Spent this month' : `Spent in ${formatMonthKey(monthKey)}`}</p>
              <p className="truncate text-4xl font-semibold tracking-tight">{formatINR(stats.spent)}</p>
              {stats.budgetTotal != null && budget ? (
                <p className="text-sm text-muted-foreground">
                  of <span className="money">{formatINR(stats.budgetTotal)}</span> budget
                  {budget.inherited ? (
                    <>
                      {' · '}
                      <Link to="/budget" className="font-medium text-brand underline-offset-4 hover:underline">
                        carried over
                      </Link>
                    </>
                  ) : null}
                </p>
              ) : (
                <Link to="/budget" className="inline-flex min-h-11 items-center text-sm font-medium text-brand">
                  Set a monthly budget
                </Link>
              )}
            </div>
            {stats.percentUsed != null ? <BudgetRing percent={stats.percentUsed} state={meterState(stats)} /> : null}
          </div>

          {status ? (
            <p className={cn('flex items-center gap-2 text-sm font-medium', TONE[status.tone])}>
              <status.icon className="size-4 shrink-0" aria-hidden />
              {status.label}
            </p>
          ) : null}

          {stats.fixedSpent + stats.upcomingFixed > 0 ? (
            <p className="text-sm text-muted-foreground">
              Fixed costs <span className="money text-foreground">{formatINR(stats.fixedSpent + stats.upcomingFixed)}</span>
              {stats.upcomingFixed > 0 ? ` (${formatINR(stats.upcomingFixed)} still to pay)` : ''} · everyday{' '}
              <span className="money text-foreground">{formatINR(stats.variableSpent)}</span>
            </p>
          ) : null}

          <div className="grid grid-cols-3 divide-x divide-border rounded-xl bg-muted/60">
            {stats.left != null ? (
              <Tile
                label={stats.left < 0 ? 'Over by' : 'Left'}
                value={<span className="money">{formatINR(Math.abs(stats.left))}</span>}
                tone={stats.left < 0 ? 'negative' : undefined}
              />
            ) : (
              <Tile label="Expenses" value={stats.count} />
            )}
            {stats.status === 'current' && stats.safePerDay != null ? (
              <Tile label="Safe per day" value={<span className="money">{formatINR(stats.safePerDay)}</span>} />
            ) : (
              <Tile label="Daily average" value={<span className="money">{formatINR(stats.dailyAverage)}</span>} />
            )}
            {stats.status === 'current' && stats.projected != null ? (
              <Tile
                label="Projected"
                value={<span className="money">{formatINR(stats.projected)}</span>}
                tone={stats.budgetTotal != null && stats.projected > stats.budgetTotal ? 'warning' : undefined}
              />
            ) : stats.left != null ? (
              <Tile label="Expenses" value={stats.count} />
            ) : (
              <Tile label="Money out" value={<span className="money">{formatINR(stats.moneyOut)}</span>} />
            )}
          </div>
        </Panel>

        {backupDue ? (
          <Panel className="flex items-center gap-3 lg:order-first lg:col-span-12">
            <CloudUpload className="size-5 shrink-0 text-brand" aria-hidden />
            <p className="min-w-0 flex-1 text-sm">
              {settings.lastBackupAt ? "It's been a week since your last backup." : "Your data lives only on this phone. Save a backup."}
            </p>
            <Button asChild size="sm" variant="secondary" className="h-11">
              <Link to="/data">Back up</Link>
            </Button>
          </Panel>
        ) : null}

        {due.length ? (
          <Section title="Due this month" className="lg:order-first lg:col-span-12">
            <Panel className="divide-y p-0">
              {due.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <CalendarClock className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="text-sm text-muted-foreground">
                      <span className="money">{formatINR(r.amount)}</span> · every month on day {r.dayOfMonth}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-11" onClick={() => void skipRecurringForMonth(r, monthKey)}>
                    Skip
                  </Button>
                  <Button
                    size="sm"
                    className="h-11"
                    onClick={async () => {
                      await addRecurringForMonth(r, monthKey, settings.defaultPaymentMethodId)
                      toast.success(`Added ${r.name}`)
                    }}
                  >
                    Add
                  </Button>
                </div>
              ))}
            </Panel>
          </Section>
        ) : null}

        {stats.count === 0 && !showWelcome ? (
          <Panel className="lg:col-span-7">
            <EmptyState
              icon={ReceiptText}
              title={stats.status === 'future' ? 'This month hasn’t started' : 'No expenses yet'}
              description={stats.status === 'future' ? undefined : 'Tap + to add one. Try typing “chai 12”.'}
              action={
                stats.status !== 'future' ? (
                  <Button className="h-11" onClick={() => openExpense()}>
                    <Plus aria-hidden /> Add expense
                  </Button>
                ) : undefined
              }
            />
          </Panel>
        ) : null}

        {stats.count > 0 ? (
          <>
            <Section title="Spending pace" className="lg:col-span-7">
              <Panel>
                <PaceChart
                  cumulative={stats.cumulative}
                  daysElapsed={stats.daysElapsed}
                  budget={stats.budgetTotal}
                  fixed={stats.fixedSpent + stats.upcomingFixed}
                  rangeStart={range.start}
                />
              </Panel>
            </Section>

            <div className="grid grid-cols-2 gap-3 lg:col-span-7">
              <Panel className="space-y-1 p-3.5">
                <p className="text-xs text-muted-foreground">Money out</p>
                <p className="text-lg font-semibold">{formatINR(stats.moneyOut)}</p>
                <p className="text-xs text-muted-foreground">Incl. lending & others' shares</p>
              </Panel>
              <Panel className="space-y-1 p-3.5">
                <p className="text-xs text-muted-foreground">
                  {stats.status === 'current' ? `vs ${formatMonthKey(prevKey)} by ${cycleDayLabel(range.start, compareIndex)}` : `vs ${formatMonthKey(prevKey)}`}
                </p>
                {prevSpent != null && prevSpent > 0 ? (
                  <>
                    <p className={cn('flex items-center gap-1 text-lg font-semibold', stats.spent <= prevSpent ? TONE.positive : TONE.warning)}>
                      {stats.spent <= prevSpent ? <ArrowDownRight className="size-5" aria-hidden /> : <ArrowUpRight className="size-5" aria-hidden />}
                      {formatINR(Math.abs(stats.spent - prevSpent))}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stats.spent <= prevSpent ? 'less' : 'more'} than {formatINR(prevSpent)}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No data for last month</p>
                )}
              </Panel>
            </div>

            <Section title="Where it went" className="lg:col-span-5 lg:row-span-2">
              <Panel className="py-1">
                <CategoryBreakdown
                  items={stats.byCategory}
                  categoryMap={categoryMap}
                  totalSpent={stats.spent}
                  onSelect={(id) => navigate(`/activity?category=${encodeURIComponent(id)}`)}
                />
              </Panel>
            </Section>

            <Section title="Day by day" className="lg:col-span-7">
              <Panel className="space-y-2">
                {stats.fixedSpent > 0 ? (
                  <p className="text-xs text-muted-foreground">Everyday spending only. Fixed costs ({formatINR(stats.fixedSpent)}) aren't shown.</p>
                ) : null}
                <DailyBars
                  byDay={stats.byDayVariable}
                  rangeStart={range.start}
                  todayIndex={todayIndex}
                  dailyBudget={stats.dailyVariableBudget}
                  onSelectDay={(i) => navigate(`/activity#${dayAnchorId(cycleDayStart(range.start, i))}`)}
                />
              </Panel>
            </Section>

            <div className="grid gap-6 sm:grid-cols-2 lg:col-span-7">
              <Section title="Most frequent">
                <Panel className="py-1">
                  <ul className="divide-y">
                    {stats.topItems.map((it) => (
                      <li key={it.name} className="flex min-h-12 items-center justify-between gap-3 py-2.5 text-sm">
                        <span className="min-w-0 truncate font-medium">
                          {it.name} <span className="font-normal text-muted-foreground">×{it.count}</span>
                        </span>
                        <span className="money font-semibold">{formatINR(it.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </Section>

              <Section title="Paid with">
                <Panel className="space-y-3">
                  {stats.byPaymentMethod.map((m) => (
                    <div key={m.paymentMethodId ?? 'none'} className="space-y-1.5">
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="truncate">
                          {m.paymentMethodId === PAID_BY_FRIEND
                            ? 'Paid by friends'
                            : m.paymentMethodId
                              ? (pmMap.get(m.paymentMethodId)?.label ?? 'Other')
                              : 'Not recorded'}
                        </span>
                        <span className="money font-semibold">{formatINR(m.amount)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${(m.amount / maxMethod) * 100}%`, background: c.series }} />
                      </div>
                    </div>
                  ))}
                </Panel>
              </Section>
            </div>
          </>
        ) : null}

        {people.owedToMe > 0 || people.iOwe > 0 ? (
          <Section title="Borrow & lend" className="lg:col-span-5">
            <Link to="/people" className="grid grid-cols-2 divide-x divide-border rounded-2xl border bg-card transition-colors active:bg-accent/40">
              <div className="p-4">
                <p className="text-xs text-muted-foreground">You'll get back</p>
                <p className="text-xl font-semibold text-positive">{formatINR(people.owedToMe)}</p>
              </div>
              <div className="p-4">
                <p className="text-xs text-muted-foreground">You owe</p>
                <p className="text-xl font-semibold text-negative">{formatINR(people.iOwe)}</p>
              </div>
            </Link>
          </Section>
        ) : null}

        {recent.length ? (
          <Section
            className="lg:col-span-7"
            title="Recent"
            action={
              <Link to="/activity" className="inline-flex min-h-11 items-center px-1 text-sm font-medium text-brand">
                See all
              </Link>
            }
          >
            <div className="divide-y overflow-hidden rounded-2xl border bg-card">
              {recent.map((t) => (
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
          </Section>
        ) : null}
      </div>
    </>
  )
}
