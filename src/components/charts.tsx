/**
 * Charts follow the dataviz method: one hue for magnitude (no 13-colour categorical palette),
 * 2px lines, ≤24px bars with 4px data-ends and 2px gaps, hairline solid grid, one y-axis,
 * legend for ≥2 series, tooltip on touch/hover, text in text tokens (never series colour).
 * Series steps from the validated reference palette: #2A78D6 (light) / #3987E5 (dark).
 */
import { useEffect, useMemo, useState } from 'react'
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useResolvedTheme } from '@/hooks/useTheme'
import { cycleDayLabel } from '@/lib/dates'
import { formatINR } from '@/lib/money'

export type MeterState = 'good' | 'warning' | 'critical'

export function useChartColors() {
  const theme = useResolvedTheme()
  return theme === 'dark'
    ? { series: '#3987E5', pace: '#94A3B8', grid: 'rgba(255,255,255,0.08)', axis: '#94A3B8', surface: '#192134', warning: '#FBBF24', critical: '#F87171' }
    : { series: '#2A78D6', pace: '#64748B', grid: '#E2E8F0', axis: '#64748B', surface: '#FFFFFF', warning: '#D97706', critical: '#DC2626' }
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

function compactRupees(v: number) {
  return formatINR(Math.round(v * 100), { compact: true })
}

function ChartTooltip({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <div className="rounded-xl border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg">
      <p className="mb-1 text-xs text-muted-foreground">{title}</p>
      {rows.map(([k, v]) => (
        <p key={k} className="flex justify-between gap-4">
          <span className="text-muted-foreground">{k}</span>
          <span className="money font-medium">{formatINR(Math.round(v * 100))}</span>
        </p>
      ))}
    </div>
  )
}

/** Circular meter: fill carries severity (accent → warning → critical); track is a light step of the same colour. */
export function BudgetRing({ percent, state, size = 104 }: { percent: number; state: MeterState; size?: number }) {
  const c = useChartColors()
  const stroke = 10
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const fill = state === 'critical' ? c.critical : state === 'warning' ? c.warning : c.series
  const shown = Math.min(Math.max(percent, 0), 1)
  const pct = Math.round(percent * 100)
  const mid = size / 2
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pct}% of budget used`}>
        <circle cx={mid} cy={mid} r={r} fill="none" stroke={fill} strokeOpacity={0.2} strokeWidth={stroke} />
        {shown > 0 ? (
          <circle
            cx={mid}
            cy={mid}
            r={r}
            fill="none"
            stroke={fill}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference * shown} ${circumference}`}
            transform={`rotate(-90 ${mid} ${mid})`}
            className="transition-[stroke-dasharray] duration-500 ease-out"
          />
        ) : null}
      </svg>
      <span aria-hidden className="absolute text-lg font-semibold">
        {pct}%
      </span>
    </div>
  )
}

function dayTicks(days: number) {
  return [...new Set([0, 7, 14, 21, days - 1])].filter((d) => d < days)
}

/** Cumulative spend (area, 2px line) vs the straight-line budget pace (dashed reference). One y-axis. */
export function PaceChart({
  cumulative,
  daysElapsed,
  budget,
  rangeStart,
  fixed = 0,
}: {
  cumulative: number[]
  daysElapsed: number
  budget: number | null
  rangeStart: number
  /** Fixed monthly costs: the pace line starts here, and only the rest of the budget is spread across the days. */
  fixed?: number
}) {
  const c = useChartColors()
  const reduced = usePrefersReducedMotion()
  const days = cumulative.length
  const base = budget ? Math.min(fixed, budget) : 0
  // Whole rupees, so tooltips and captions don't show paise.
  const paceAt = (dayCount: number) => (budget ? Math.round((base + ((budget - base) * dayCount) / days) / 100) * 100 : null)
  const data = useMemo(
    () =>
      cumulative.map((v, i) => {
        const pace = paceAt(i + 1)
        return { i, spent: i < daysElapsed ? v / 100 : null, pace: pace == null ? null : pace / 100 }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cumulative, daysElapsed, budget, days, base],
  )
  const spentNow = daysElapsed > 0 ? cumulative[Math.min(daysElapsed, days) - 1] : 0
  const paceNow = daysElapsed > 0 ? paceAt(Math.min(daysElapsed, days)) : null
  const summary =
    paceNow != null
      ? `Spent ${formatINR(spentNow)} so far against a budget pace of ${formatINR(paceNow)}.`
      : `Spent ${formatINR(spentNow)} so far.`

  return (
    <figure className="space-y-2">
      <figcaption className="sr-only">{summary}</figcaption>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: c.series }} />
          Spent
        </span>
        {budget ? (
          <span className="inline-flex items-center gap-1.5">
            <svg width="16" height="2" aria-hidden>
              <line x1="0" y1="1" x2="16" y2="1" stroke={c.pace} strokeWidth="2" strokeDasharray="3 3" />
            </svg>
            Budget pace
          </span>
        ) : null}
      </div>
      <div className="h-44 lg:h-64" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis
              dataKey="i"
              ticks={dayTicks(days)}
              interval={0}
              tickFormatter={(i: number) => cycleDayLabel(rangeStart, i)}
              tick={{ fill: c.axis, fontSize: 12 }}
              axisLine={{ stroke: c.grid }}
              tickLine={false}
            />
            <YAxis width={52} tickFormatter={compactRupees} tick={{ fill: c.axis, fontSize: 12 }} axisLine={false} tickLine={false} tickCount={4} />
            <Tooltip
              cursor={{ stroke: c.axis, strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as (typeof data)[number]
                const rows: [string, number][] = []
                if (p.spent != null) rows.push(['Spent', p.spent])
                if (p.pace != null) rows.push(['Budget pace', p.pace])
                return <ChartTooltip title={cycleDayLabel(rangeStart, p.i)} rows={rows} />
              }}
            />
            <Area
              type="monotone"
              dataKey="spent"
              stroke={c.series}
              strokeWidth={2}
              fill={c.series}
              fillOpacity={0.12}
              dot={false}
              activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2, fill: c.series }}
              isAnimationActive={!reduced}
            />
            {budget ? (
              <Line type="linear" dataKey="pace" stroke={c.pace} strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

/** Spend per day. One hue; today emphasised; optional dashed daily-budget reference. Tap a bar to open that day. */
export function DailyBars({
  byDay,
  rangeStart,
  todayIndex,
  dailyBudget,
  onSelectDay,
}: {
  byDay: number[]
  rangeStart: number
  todayIndex: number
  dailyBudget: number | null
  onSelectDay?: (index: number) => void
}) {
  const c = useChartColors()
  const reduced = usePrefersReducedMotion()
  const days = byDay.length
  const data = useMemo(() => byDay.map((v, i) => ({ i, amount: v / 100 })), [byDay])
  const busiest = byDay.reduce((best, v, i) => (v > byDay[best] ? i : best), 0)

  return (
    <figure className="space-y-2">
      <figcaption className="sr-only">
        {byDay[busiest] > 0
          ? `Highest spend was ${formatINR(byDay[busiest])} on ${cycleDayLabel(rangeStart, busiest)}.`
          : 'No spending recorded yet.'}
      </figcaption>
      {dailyBudget ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-hidden>
          <svg width="16" height="2" aria-hidden>
            <line x1="0" y1="1" x2="16" y2="1" stroke={c.pace} strokeWidth="2" strokeDasharray="3 3" />
          </svg>
          Daily budget {formatINR(dailyBudget)}
        </div>
      ) : null}
      <div className="h-40 lg:h-56" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            barCategoryGap={2}
            onClick={(state) => {
              const idx = state?.activeTooltipIndex
              if (idx != null && onSelectDay) onSelectDay(Number(idx))
            }}
          >
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis
              dataKey="i"
              ticks={dayTicks(days)}
              interval={0}
              tickFormatter={(i: number) => cycleDayLabel(rangeStart, i)}
              tick={{ fill: c.axis, fontSize: 12 }}
              axisLine={{ stroke: c.grid }}
              tickLine={false}
            />
            <YAxis width={52} tickFormatter={compactRupees} tick={{ fill: c.axis, fontSize: 12 }} axisLine={false} tickLine={false} tickCount={4} />
            <Tooltip
              cursor={{ fill: c.series, fillOpacity: 0.08 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const p = payload[0].payload as (typeof data)[number]
                return <ChartTooltip title={cycleDayLabel(rangeStart, p.i)} rows={[['Spent', p.amount]]} />
              }}
            />
            {dailyBudget ? <ReferenceLine y={dailyBudget / 100} stroke={c.pace} strokeDasharray="4 4" strokeWidth={1.5} ifOverflow="extendDomain" /> : null}
            <Bar dataKey="amount" radius={[3, 3, 0, 0]} maxBarSize={24} isAnimationActive={!reduced} style={{ cursor: onSelectDay ? 'pointer' : undefined }}>
              {data.map((d) => (
                <Cell key={d.i} fill={c.series} fillOpacity={todayIndex < 0 || d.i === todayIndex ? 1 : 0.6} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
