import { ChevronDown, ChevronRight, type LucideIcon, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'

/** Phones: bottom sheet. Desktop: full-height panel sliding in from the right. */
export const BOTTOM_SHEET_CLASS = 'mx-auto max-h-[94dvh] max-w-lg'
export const SIDE_SHEET_CLASS = 'data-[vaul-drawer-direction=right]:w-full data-[vaul-drawer-direction=right]:sm:max-w-md'

/** Form shell: header with close, scrollable body, sticky footer. */
export function FormSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}) {
  const isDesktop = useIsDesktop()
  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction={isDesktop ? 'right' : 'bottom'}>
      <DrawerContent className={isDesktop ? SIDE_SHEET_CLASS : BOTTOM_SHEET_CLASS}>
        <DrawerHeader className="flex-row items-center justify-between gap-2 px-4 pb-2 pt-2 text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
          <div className="min-w-0">
            <DrawerTitle className="text-lg">{title}</DrawerTitle>
            <DrawerDescription className={description ? undefined : 'sr-only'}>{description ?? title}</DrawerDescription>
          </div>
          <Button type="button" variant="ghost" size="icon" className="size-11 rounded-full" aria-label="Close" onClick={() => onOpenChange(false)}>
            <X className="size-5" />
          </Button>
        </DrawerHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-4">{children}</div>
        {footer ? <DrawerFooter className="pb-safe-4 flex-row gap-2 border-t bg-background pt-3">{footer}</DrawerFooter> : null}
      </DrawerContent>
    </Drawer>
  )
}

/** ₹-prefixed amount field. */
export function MoneyInput({
  id,
  value,
  onChange,
  error,
  large,
  placeholder = '0',
  className,
  inputRef,
  ...rest
}: {
  id: string
  value: string
  onChange: (value: string) => void
  error?: string
  large?: boolean
  inputRef?: React.Ref<HTMLInputElement>
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'id'>) {
  return (
    <div className={className}>
      <div
        className={cn(
          'flex items-center gap-1 transition-colors',
          large
            ? 'border-b-2 pb-1 focus-within:border-brand'
            : 'h-12 rounded-md border border-input bg-transparent px-3 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30',
          error ? 'border-negative' : large ? 'border-border' : undefined,
        )}
      >
        <span className={cn('font-semibold text-muted-foreground', large ? 'text-3xl' : 'text-base')} aria-hidden>
          ₹
        </span>
        <input
          ref={inputRef}
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder={placeholder}
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
          className={cn(
            'w-full min-w-0 bg-transparent outline-none placeholder:text-muted-foreground/50',
            large ? 'text-4xl font-semibold' : 'text-base',
          )}
          {...rest}
        />
      </div>
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-sm text-negative">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function NativeSelect({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(
          'h-11 w-full appearance-none rounded-md border border-input bg-background pl-3 pr-9 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </div>
  )
}

/** Tappable list row linking to a page. */
export function NavRow({
  to,
  icon: Icon,
  label,
  description,
  trailing,
  onClick,
  disabled,
}: {
  to?: string
  icon: LucideIcon
  label: string
  description?: string
  trailing?: ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  const inner = (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{label}</span>
        {description ? <span className="block text-sm text-muted-foreground">{description}</span> : null}
      </span>
      {trailing ?? (to || onClick ? <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden /> : null)}
    </>
  )
  const cls = cn(
    'flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors',
    disabled ? 'cursor-default opacity-70' : 'active:bg-accent/60',
  )
  if (to && !disabled) {
    return (
      <Link to={to} className={cls}>
        {inner}
      </Link>
    )
  }
  if (onClick && !disabled) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    )
  }
  return (
    <div className={cls} aria-disabled={disabled || undefined}>
      {inner}
    </div>
  )
}
