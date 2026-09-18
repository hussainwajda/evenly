import { Cloud, CreditCard, Download, FileSpreadsheet, HardDriveDownload, QrCode, Repeat, Settings2, Shapes, Target } from 'lucide-react'
import { PageHeader, Section } from '@/components/common'
import { NavRow } from '@/components/FormParts'
import { describeSync } from '@/components/SyncParts'
import { Badge } from '@/components/ui/badge'
import { useNow } from '@/hooks/useData'
import { useInstallPrompt } from '@/lib/install'
import { useSyncStore } from '@/sync/controller'

export function MorePage() {
  const { canInstall, install } = useInstallPrompt()
  const sync = useSyncStore()
  const now = useNow(60_000)
  const status = describeSync(sync, now)

  return (
    <>
      <PageHeader title="More" />
      <div className="space-y-6 px-4 pt-2 lg:max-w-3xl">
        <Section title="Account">
          <div className="overflow-hidden rounded-2xl border bg-card">
            <NavRow
              to="/account"
              icon={sync.user ? status.icon : Cloud}
              label={sync.user ? sync.user.email : 'Account & sync'}
              description={sync.status === 'signedOut' ? 'Sign in with Google to back up and sync' : status.label}
            />
          </div>
        </Section>

        <Section title="Money">
          <div className="divide-y overflow-hidden rounded-2xl border bg-card">
            <NavRow to="/budget" icon={Target} label="Budget" description="Monthly limit and category budgets" />
            <NavRow to="/recurring" icon={Repeat} label="Recurring expenses" description="Rent, wifi, recharge…" />
            <NavRow to="/categories" icon={Shapes} label="Categories" description="Names, icons and auto-categorising words" />
            <NavRow to="/payment-methods" icon={CreditCard} label="Payment methods" description="UPI apps, cash, cards" />
          </div>
        </Section>

        <Section title="Data">
          <div className="divide-y overflow-hidden rounded-2xl border bg-card">
            <NavRow to="/import" icon={FileSpreadsheet} label="Import from Excel" description="Bring in your monthly expenses sheet" />
            <NavRow to="/data" icon={HardDriveDownload} label="Backup & export" description="Save a backup, restore, export CSV" />
          </div>
        </Section>

        <Section title="App">
          <div className="divide-y overflow-hidden rounded-2xl border bg-card">
            <NavRow to="/settings" icon={Settings2} label="Settings" description="Theme, month start, default payment" />
            {canInstall ? <NavRow onClick={() => void install()} icon={Download} label="Install Evenly" description="Add to your home screen, works offline" /> : null}
          </div>
        </Section>

        <Section title="Coming later">
          <div className="overflow-hidden rounded-2xl border bg-card">
            <NavRow
              icon={QrCode}
              label="Scan & pay with UPI"
              description="Scan a QR, pay in your UPI app, and log it in one tap. Android only."
              disabled
              trailing={<Badge variant="secondary">Planned</Badge>}
            />
          </div>
        </Section>

        <p className="pb-2 text-center text-xs text-muted-foreground">
          Evenly 1.1 · {sync.user ? 'Saved on this device and synced to your Google account' : 'Your data stays on this device'}
        </p>
      </div>
    </>
  )
}
