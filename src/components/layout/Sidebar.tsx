import {
  CreditCard,
  Download,
  FileSpreadsheet,
  HardDriveDownload,
  House,
  type LucideIcon,
  Plus,
  ReceiptText,
  Repeat,
  Settings2,
  Shapes,
  Target,
  Users,
} from 'lucide-react'
import { NavLink } from 'react-router'
import { describeSync, SYNC_TONE_CLASS } from '@/components/SyncParts'
import { Button } from '@/components/ui/button'
import { useNow } from '@/hooks/useData'
import { useInstallPrompt } from '@/lib/install'
import { cn } from '@/lib/utils'
import { useUi } from '@/stores/ui'
import { useSyncStore } from '@/sync/controller'

const GROUPS: { label: string; links: { to: string; label: string; icon: LucideIcon; end?: boolean }[] }[] = [
  {
    label: 'Overview',
    links: [
      { to: '/', label: 'Home', icon: House, end: true },
      { to: '/activity', label: 'Activity', icon: ReceiptText },
      { to: '/people', label: 'Groups & friends', icon: Users },
    ],
  },
  {
    label: 'Money',
    links: [
      { to: '/budget', label: 'Budget', icon: Target },
      { to: '/recurring', label: 'Recurring', icon: Repeat },
      { to: '/categories', label: 'Categories', icon: Shapes },
      { to: '/payment-methods', label: 'Payment methods', icon: CreditCard },
    ],
  },
  {
    label: 'Data',
    links: [
      { to: '/import', label: 'Import from Excel', icon: FileSpreadsheet },
      { to: '/data', label: 'Backup & export', icon: HardDriveDownload },
    ],
  },
  {
    label: 'App',
    links: [{ to: '/settings', label: 'Settings', icon: Settings2 }],
  },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
    isActive ? 'bg-brand/15 text-foreground [&_svg]:text-brand' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
  )

/** Desktop navigation (lg+). The bottom tab bar is used on phones instead. */
export function Sidebar() {
  const openExpense = useUi((s) => s.openExpense)
  const sync = useSyncStore()
  const now = useNow(60_000)
  const status = describeSync(sync, now)
  const { canInstall, install } = useInstallPrompt()

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r bg-card/60 backdrop-blur-xl lg:flex">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <img src="/pwa-64x64.png" alt="" className="size-8 rounded-lg" />
        <span className="text-lg font-semibold tracking-tight">Evenly</span>
      </div>

      <div className="px-4">
        <Button className="h-11 w-full justify-start" onClick={() => openExpense()}>
          <Plus aria-hidden /> Add expense
          <kbd className="ml-auto rounded border border-white/30 px-1.5 text-xs font-medium opacity-80" aria-hidden>
            N
          </kbd>
        </Button>
      </div>

      <nav aria-label="Primary" className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {GROUPS.map((g) => (
          <div key={g.label} className="space-y-1">
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
            {g.links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={linkClass}>
                <l.icon className="size-[18px]" aria-hidden />
                {l.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t p-3">
        {canInstall ? (
          <button type="button" onClick={() => void install()} className={linkClass({ isActive: false }) + ' w-full'}>
            <Download className="size-[18px]" aria-hidden /> Install app
          </button>
        ) : null}
        <NavLink to="/account" className={({ isActive }) => cn(linkClass({ isActive }), 'h-auto py-2.5')}>
          <status.icon className={cn('size-[18px] shrink-0', SYNC_TONE_CLASS[status.tone], status.spin && 'motion-safe:animate-spin')} aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-foreground">{sync.user ? sync.user.email : 'Account & sync'}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {sync.status === 'signedOut' ? 'Sign in to sync' : status.label}
            </span>
          </span>
        </NavLink>
      </div>
    </aside>
  )
}
