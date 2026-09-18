import { House, LayoutGrid, Plus, ReceiptText, Users } from 'lucide-react'
import { NavLink } from 'react-router'
import { cn } from '@/lib/utils'
import { useUi } from '@/stores/ui'

const LINKS = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/activity', label: 'Activity', icon: ReceiptText, end: false },
  null,
  { to: '/people', label: 'Groups', icon: Users, end: false },
  { to: '/more', label: 'More', icon: LayoutGrid, end: false },
] as const

export function BottomNav() {
  const openExpense = useUi((s) => s.openExpense)

  return (
    <nav aria-label="Primary" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-glass backdrop-blur-xl lg:hidden">
      <ul className="mx-auto grid h-[var(--nav-height)] max-w-lg grid-cols-5 items-stretch">
        {LINKS.map((item) =>
          item === null ? (
            <li key="add" className="flex items-start justify-center">
              <button
                type="button"
                onClick={() => openExpense()}
                aria-label="Add expense"
                className="-mt-5 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background transition-[transform,opacity] duration-150 active:scale-95 active:opacity-90"
              >
                <Plus className="size-7" strokeWidth={2.5} aria-hidden />
              </button>
            </li>
          ) : (
            <li key={item.to} className="flex">
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'group flex min-h-12 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors duration-150',
                    isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'grid h-8 w-14 place-items-center rounded-full transition-colors duration-200',
                        isActive ? 'bg-brand/20 text-brand' : 'group-active:bg-accent',
                      )}
                    >
                      <item.icon className="size-[22px]" strokeWidth={isActive ? 2.25 : 2} aria-hidden />
                    </span>
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ),
        )}
      </ul>
    </nav>
  )
}
