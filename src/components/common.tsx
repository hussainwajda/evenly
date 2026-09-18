import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { addMonths, formatMonthKey } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useUi } from '@/stores/ui'

export function Money({
  value,
  className,
  signed,
  compact,
}: {
  value: number
  className?: string
  signed?: boolean
  compact?: boolean
}) {
  return <span className={cn('money', className)}>{formatINR(value, { signed, compact })}</span>
}

export function PageHeader({
  title,
  subtitle,
  backTo,
  actions,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  /** Show a back button; navigates back in history, or to this path when there is no history. */
  backTo?: string
  actions?: ReactNode
  className?: string
}) {
  const navigate = useNavigate()
  return (
    <header className={cn('pt-safe sticky top-0 z-30 border-b border-transparent bg-background/85 backdrop-blur-lg', className)}>
      <div className="flex h-14 items-center gap-1 px-2 lg:max-w-3xl">
        {backTo ? (
          <Button
            variant="ghost"
            size="icon"
            // On desktop the sidebar replaces the More tab, so "back to More" isn't needed there.
            className={cn('size-11 rounded-full', backTo === '/more' && 'lg:hidden')}
            aria-label="Back"
            onClick={() => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate(backTo))}
          >
            <ChevronLeft className="size-6" />
          </Button>
        ) : (
          <span className="w-2" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold leading-tight">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-1 pr-1">{actions}</div> : null}
      </div>
    </header>
  )
}

export function MonthSwitcher({
  monthKey,
  currentMonthKey,
  className,
}: {
  monthKey: string
  currentMonthKey: string
  className?: string
}) {
  const setMonthKey = useUi((s) => s.setMonthKey)
  const go = (n: number) => {
    const next = addMonths(monthKey, n)
    setMonthKey(next === currentMonthKey ? null : next)
  }
  const isCurrent = monthKey === currentMonthKey
  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      <Button variant="ghost" size="icon" className="size-11 rounded-full" aria-label="Previous month" onClick={() => go(-1)}>
        <ChevronLeft className="size-5" />
      </Button>
      <button
        type="button"
        onClick={() => setMonthKey(null)}
        className="min-h-11 rounded-full px-2 text-base font-semibold"
        aria-label={isCurrent ? `${formatMonthKey(monthKey, true)}, current month` : `${formatMonthKey(monthKey, true)}. Tap to return to the current month`}
      >
        {formatMonthKey(monthKey)}
        {!isCurrent ? <span className="ml-1.5 align-middle text-xs font-medium text-brand">Today</span> : null}
      </button>
      <Button variant="ghost" size="icon" className="size-11 rounded-full" aria-label="Next month" onClick={() => go(1)}>
        <ChevronRight className="size-5" />
      </Button>
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-6 py-10 text-center', className)}>
      <span className="grid size-14 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-7" aria-hidden />
      </span>
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}

export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-3', className)}>
      {title || action ? (
        <div className="flex items-center justify-between px-1">
          {title ? <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-2xl border bg-card p-4 text-card-foreground', className)}>{children}</div>
}

/** 44px+ segmented control built on buttons (radio semantics). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
  className?: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('grid gap-1 rounded-xl bg-muted p-1', className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-11 rounded-lg px-2 text-sm font-medium transition-colors',
            value === o.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Selectable pill (checkbox/radio semantics via aria-pressed). */
export function Chip({
  selected,
  onClick,
  children,
  className,
  ...rest
}: {
  selected?: boolean
  onClick?: () => void
  children: ReactNode
  className?: string
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
        selected ? 'border-brand bg-brand/15 text-foreground' : 'bg-card text-muted-foreground hover:text-foreground',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
