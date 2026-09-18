import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { CategoryIcon } from '@/components/CategoryIcon'
import { useChartColors } from '@/components/charts'
import { formatINR } from '@/lib/money'
import type { CategoryStat } from '@/lib/stats'
import type { Category } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Ranked horizontal bars on ONE shared scale (largest of spend / category budget).
 * Identity comes from the icon + name, not bar colour; a category budget is a tick on the same track.
 */
export function CategoryBreakdown({
  items,
  categoryMap,
  totalSpent,
  onSelect,
  initial = 6,
}: {
  items: CategoryStat[]
  categoryMap: Map<string, Category>
  totalSpent: number
  onSelect?: (categoryId: string) => void
  initial?: number
}) {
  const c = useChartColors()
  const [expanded, setExpanded] = useState(false)
  const rows = items.filter((s) => s.amount > 0 || s.budget)
  const shown = expanded ? rows : rows.slice(0, initial)
  const max = Math.max(1, ...rows.map((s) => Math.max(s.amount, s.budget ?? 0)))

  return (
    <div>
      <ul className="divide-y">
        {shown.map((s) => {
          const cat = categoryMap.get(s.categoryId)
          const over = s.budget != null && s.amount > s.budget
          const share = totalSpent > 0 ? Math.round((s.amount / totalSpent) * 100) : 0
          return (
            <li key={s.categoryId}>
              <button
                type="button"
                onClick={() => onSelect?.(s.categoryId)}
                className="flex min-h-14 w-full items-center gap-3 py-3 text-left transition-colors active:bg-accent/40"
              >
                <CategoryIcon icon={cat?.icon} color={cat?.color} size="sm" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{cat?.name ?? 'Unknown'}</span>
                    <span className="money text-sm font-semibold">{formatINR(s.amount)}</span>
                  </div>
                  <div className="relative h-1.5 rounded-full bg-muted">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
                      style={{ width: `${(s.amount / max) * 100}%`, background: over ? c.critical : c.series }}
                    />
                    {s.budget ? (
                      <div
                        className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground/70"
                        style={{ left: `calc(${(s.budget / max) * 100}% - 1px)` }}
                        aria-hidden
                      />
                    ) : null}
                  </div>
                  <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {s.count} {s.count === 1 ? 'expense' : 'expenses'} · {share}%
                    </span>
                    {s.budget ? (
                      <span className={cn(over && 'font-medium text-negative')}>
                        {over ? `Over by ${formatINR(s.amount - s.budget)}` : `${formatINR(s.budget - s.amount)} left`}
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
      {rows.length > initial ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 flex min-h-11 w-full items-center justify-center gap-1 text-sm font-medium text-brand"
        >
          {expanded ? 'Show less' : `Show all ${rows.length} categories`}
          <ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
