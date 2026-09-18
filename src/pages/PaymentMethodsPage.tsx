import { Archive, ArchiveRestore, Banknote, CreditCard, Landmark, type LucideIcon, Plus, Smartphone, Wallet } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Chip, PageHeader, Section } from '@/components/common'
import { FormSheet } from '@/components/FormParts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { savePaymentMethod, setPaymentMethodArchived, updateSettings } from '@/db/repo'
import { usePaymentMethods, useSettings } from '@/hooks/useData'
import type { PaymentMethod, PaymentMethodType } from '@/lib/types'

const TYPES: { value: PaymentMethodType; label: string; icon: LucideIcon }[] = [
  { value: 'upi', label: 'UPI', icon: Smartphone },
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'card', label: 'Card', icon: CreditCard },
  { value: 'netbanking', label: 'Bank', icon: Landmark },
  { value: 'wallet', label: 'Wallet', icon: Wallet },
  { value: 'other', label: 'Other', icon: Wallet },
]
const iconFor = (t: PaymentMethodType) => TYPES.find((x) => x.value === t)?.icon ?? Wallet

export function PaymentMethodsPage() {
  const methods = usePaymentMethods()
  const settings = useSettings()
  const [editing, setEditing] = useState<PaymentMethod | 'new' | null>(null)
  const active = methods.filter((m) => !m.archived)
  const archived = methods.filter((m) => m.archived)

  const row = (m: PaymentMethod) => {
    const Icon = iconFor(m.type)
    return (
      <li key={m.id}>
        <button type="button" onClick={() => setEditing(m)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-accent/60">
          <span className="grid size-10 place-items-center rounded-xl bg-muted">
            <Icon className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{m.label}</span>
          {settings.defaultPaymentMethodId === m.id ? <Badge>Default</Badge> : null}
        </button>
      </li>
    )
  }

  return (
    <>
      <PageHeader
        title="Payment methods"
        backTo="/more"
        actions={
          <Button className="h-11 rounded-full" onClick={() => setEditing('new')}>
            <Plus aria-hidden /> Add
          </Button>
        }
      />
      <div className="space-y-6 px-4 pt-2 lg:max-w-3xl">
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card">{active.map(row)}</ul>
        {archived.length ? (
          <Section title="Archived">
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card opacity-80">{archived.map(row)}</ul>
          </Section>
        ) : null}
      </div>
      <MethodSheet
        key={editing === 'new' ? 'new' : (editing?.id ?? 'none')}
        method={editing === 'new' ? null : editing}
        open={editing !== null}
        isDefault={editing !== 'new' && editing !== null && settings.defaultPaymentMethodId === editing.id}
        onClose={() => setEditing(null)}
      />
    </>
  )
}

function MethodSheet({ method, open, isDefault, onClose }: { method: PaymentMethod | null; open: boolean; isDefault: boolean; onClose: () => void }) {
  const [label, setLabel] = useState(method?.label ?? '')
  const [type, setType] = useState<PaymentMethodType>(method?.type ?? 'upi')
  const [makeDefault, setMakeDefault] = useState(isDefault)
  const [error, setError] = useState<string>()

  async function save() {
    if (!label.trim()) {
      setError('Enter a name, e.g. UPI · Paytm')
      return
    }
    const id = await savePaymentMethod({ label, type }, method?.id)
    if (makeDefault && !isDefault) await updateSettings({ defaultPaymentMethodId: id })
    onClose()
    toast.success(method ? 'Payment method updated' : 'Payment method added')
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={method ? 'Edit payment method' : 'New payment method'}
      footer={
        <>
          {method && !isDefault ? (
            <Button
              type="button"
              variant="ghost"
              className="h-12"
              onClick={async () => {
                await setPaymentMethodArchived(method.id, !method.archived)
                onClose()
              }}
            >
              {method.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
              {method.archived ? 'Restore' : 'Archive'}
            </Button>
          ) : null}
          <Button type="submit" form="method-form" className="h-12 flex-1 text-base">
            Save
          </Button>
        </>
      }
    >
      <form
        id="method-form"
        className="space-y-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="pm-label">Name</Label>
          <Input
            id="pm-label"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value)
              setError(undefined)
            }}
            placeholder="UPI · Paytm"
            className="h-12"
            aria-invalid={Boolean(error)}
          />
          {error ? <p className="text-sm text-negative">{error}</p> : null}
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Type</legend>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((t) => (
              <Chip key={t.value} selected={type === t.value} onClick={() => setType(t.value)}>
                <t.icon className="size-4" aria-hidden />
                {t.label}
              </Chip>
            ))}
          </div>
        </fieldset>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="pm-default">Use by default for new expenses</Label>
          <Switch id="pm-default" checked={makeDefault} disabled={isDefault} onCheckedChange={setMakeDefault} />
        </div>
      </form>
    </FormSheet>
  )
}
