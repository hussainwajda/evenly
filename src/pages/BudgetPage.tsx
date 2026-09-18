import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/CategoryIcon'
import { Chip, MonthSwitcher, PageHeader, Panel, Section } from '@/components/common'
import { MoneyInput } from '@/components/FormParts'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { db } from '@/db'
import { setBudget, transactionsBetween } from '@/db/repo'
import { useBudget, useCategories, useSelectedMonth } from '@/hooks/useData'
import { addMonths, formatMonthKey, monthRange } from '@/lib/dates'
import { formatINR, paiseToInput, toPaise } from '@/lib/money'
import { cn } from '@/lib/utils'

const roundUp500 = (paise: number) => Math.ceil(paise / 50_000) * 50_000

export function BudgetPage() {
  const { monthKey, currentMonthKey, startDay, range } = useSelectedMonth()
  const categories = useCategories()
  const active = useMemo(() => categories.filter((c) => !c.archived), [categories])
  const exact = useLiveQuery(async () => (await db.budgets.get(monthKey)) ?? null, [monthKey])
  const effective = useBudget(monthKey)
  const history = useLiveQuery(
    () => transactionsBetween(monthRange(addMonths(monthKey, -3), startDay).start, range.start),
    [monthKey, startDay, range.start],
  )

  const [totalText, setTotalText] = useState('')
  const [catText, setCatText] = useState<Record<string, string>>({})
  const [showCats, setShowCats] = useState(false)
  const [initFor, setInitFor] = useState<string | null>(null)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (effective === undefined || initFor === monthKey) return
    setTotalText(effective ? paiseToInput(effective.total) : '')
    const per = effective?.perCategory ?? {}
    setCatText(Object.fromEntries(Object.entries(per).map(([k, v]) => [k, paiseToInput(v)])))
    setShowCats(Object.keys(per).length > 0)
    setInitFor(monthKey)
  }, [effective, monthKey, initFor])

  const past = useMemo(() => {
    if (!history) return null
    const months = [1, 2, 3].map((n) => {
      const r = monthRange(addMonths(monthKey, -n), startDay)
      const byCat = new Map<string, number>()
      let total = 0
      for (const t of history) {
        if (t.excludeFromSpend || t.occurredAt < r.start || t.occurredAt >= r.end) continue
        total += t.amount
        byCat.set(t.categoryId, (byCat.get(t.categoryId) ?? 0) + t.amount)
      }
      return { total, byCat }
    })
    const withData = months.filter((m) => m.total > 0)
    return {
      last: months[0],
      average: withData.length ? Math.round(withData.reduce((a, m) => a + m.total, 0) / withData.length) : 0,
      monthsWithData: withData.length,
    }
  }, [history, monthKey, startDay])

  const total = toPaise(totalText)
  const catSum = Object.values(catText).reduce((a, v) => a + toPaise(v), 0)

  async function save() {
    if (total <= 0) {
      setError('Enter a monthly budget')
      return
    }
    const per = Object.fromEntries(Object.entries(catText).map(([k, v]) => [k, toPaise(v)]))
    await setBudget(monthKey, total, per)
    toast.success(`Budget saved for ${formatMonthKey(monthKey, true)}`)
  }

  return (
    <>
      <PageHeader title="Budget" backTo="/more" actions={<MonthSwitcher monthKey={monthKey} currentMonthKey={currentMonthKey} />} />
      <form
        className="space-y-6 px-4 pt-2 lg:max-w-3xl"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        {effective?.inherited ? (
          <p className="rounded-xl bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">
            Using the budget from {formatMonthKey(effective.monthKey, true)}. Saving creates one for {formatMonthKey(monthKey, true)}; later months will carry it forward.
          </p>
        ) : null}

        <Panel className="space-y-3">
          <Label htmlFor="budget-total" className="text-muted-foreground">
            Monthly budget for {formatMonthKey(monthKey, true)}
          </Label>
          <MoneyInput
            id="budget-total"
            large
            value={totalText}
            onChange={(v) => {
              setTotalText(v)
              setError(undefined)
            }}
            error={error}
          />
          {past && (past.last.total > 0 || past.average > 0) ? (
            <div className="flex flex-wrap gap-2 pt-1">
              {past.last.total > 0 ? (
                <Chip onClick={() => setTotalText(paiseToInput(roundUp500(past.last.total)))}>
                  Last month {formatINR(past.last.total)}
                </Chip>
              ) : null}
              {past.monthsWithData > 1 ? (
                <Chip onClick={() => setTotalText(paiseToInput(roundUp500(past.average)))}>
                  {past.monthsWithData}-month avg {formatINR(past.average)}
                </Chip>
              ) : null}
            </div>
          ) : null}
        </Panel>

        <Section>
          <button
            type="button"
            onClick={() => setShowCats((v) => !v)}
            aria-expanded={showCats}
            className="flex min-h-11 w-full items-center justify-between px-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Category budgets (optional)
            <ChevronDown className={cn('size-4 transition-transform', showCats && 'rotate-180')} aria-hidden />
          </button>
          {showCats ? (
            <Panel className="space-y-1 py-2">
              {active.map((c) => {
                const last = past?.last.byCat.get(c.id) ?? 0
                return (
                  <div key={c.id} className="flex items-center gap-3 py-2">
                    <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <Label htmlFor={`cat-${c.id}`} className="truncate">
                        {c.name}
                      </Label>
                      <p className="text-xs text-muted-foreground">{last ? `Last month ${formatINR(last)}` : 'No spend last month'}</p>
                    </div>
                    <MoneyInput
                      id={`cat-${c.id}`}
                      value={catText[c.id] ?? ''}
                      placeholder="—"
                      onChange={(v) => setCatText((x) => ({ ...x, [c.id]: v }))}
                      className="w-32"
                    />
                  </div>
                )
              })}
              <p className={cn('pt-2 text-sm', total > 0 && catSum > total ? 'text-warning' : 'text-muted-foreground')}>
                Category budgets add up to <span className="money font-medium">{formatINR(catSum)}</span>
                {total > 0 ? (catSum > total ? ` — more than your ${formatINR(total)} total` : ` of ${formatINR(total)}`) : ''}
              </p>
            </Panel>
          ) : null}
        </Section>

        <div className="space-y-2">
          <Button type="submit" className="h-12 w-full text-base">
            Save budget
          </Button>
          {exact ? (
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-full text-negative hover:text-negative"
              onClick={async () => {
                await db.budgets.delete(monthKey)
                setInitFor(null)
                toast(`Removed the budget for ${formatMonthKey(monthKey, true)}`)
              }}
            >
              Remove this month's budget
            </Button>
          ) : null}
        </div>
      </form>
    </>
  )
}
