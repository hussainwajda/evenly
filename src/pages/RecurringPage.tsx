import { Plus, Repeat, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/CategoryIcon'
import { Chip, EmptyState, PageHeader, Panel } from '@/components/common'
import { FormSheet, MoneyInput, NativeSelect } from '@/components/FormParts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { db } from '@/db'
import { deleteRecurring, saveRecurring } from '@/db/repo'
import { useCategories, useCategoryMap, usePaymentMethods, useRecurring } from '@/hooks/useData'
import { suggestCategory } from '@/lib/categorize'
import { formatINR, paiseToInput, toPaise } from '@/lib/money'
import type { Recurring } from '@/lib/types'

const IDEAS = ['Rent', 'Wifi', 'Mobile recharge', 'Maid', 'Electricity bill', 'Gym', 'Google Play']

export function RecurringPage() {
  const items = useRecurring()
  const categoryMap = useCategoryMap()
  const [editing, setEditing] = useState<{ item: Recurring | null; name?: string } | null>(null)
  const sorted = [...items].sort((a, b) => a.dayOfMonth - b.dayOfMonth)

  return (
    <>
      <PageHeader
        title="Recurring expenses"
        backTo="/more"
        actions={
          <Button className="h-11 rounded-full" onClick={() => setEditing({ item: null })}>
            <Plus aria-hidden /> Add
          </Button>
        }
      />
      <div className="space-y-4 px-4 pt-2 lg:max-w-3xl">
        <p className="px-1 text-sm text-muted-foreground">
          These show up on Home when due, so you can add them with one tap. They also count as fixed costs, so projections and safe-per-day don't spread them across the month.
        </p>
        {sorted.length === 0 ? (
          <Panel>
            <EmptyState
              icon={Repeat}
              title="No recurring expenses"
              description="Start with one of these:"
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {IDEAS.map((n) => (
                    <Chip key={n} onClick={() => setEditing({ item: null, name: n })}>
                      {n}
                    </Chip>
                  ))}
                </div>
              }
            />
          </Panel>
        ) : (
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {sorted.map((r) => {
              const cat = categoryMap.get(r.categoryId)
              return (
                <li key={r.id} className="flex min-h-16 items-center gap-3 px-4 py-3">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setEditing({ item: r })}>
                    <CategoryIcon icon={cat?.icon} color={cat?.color} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.name}</span>
                      <span className="block truncate text-sm text-muted-foreground">
                        <span className="money">{formatINR(r.amount)}</span> · day {r.dayOfMonth}
                        {r.active ? '' : ' · paused'}
                      </span>
                    </span>
                  </button>
                  <Switch
                    checked={r.active}
                    aria-label={`${r.name} active`}
                    onCheckedChange={(v) => void db.recurring.update(r.id, { active: v })}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <RecurringSheet
        key={editing ? (editing.item?.id ?? `new-${editing.name ?? ''}`) : 'none'}
        open={editing !== null}
        item={editing?.item ?? null}
        initialName={editing?.name}
        onClose={() => setEditing(null)}
      />
    </>
  )
}

function RecurringSheet({ open, item, initialName, onClose }: { open: boolean; item: Recurring | null; initialName?: string; onClose: () => void }) {
  const categories = useCategories().filter((c) => !c.archived || c.id === item?.categoryId)
  const methods = usePaymentMethods().filter((m) => !m.archived || m.id === item?.paymentMethodId)
  const [name, setName] = useState(item?.name ?? initialName ?? '')
  const [amountText, setAmountText] = useState(item ? paiseToInput(item.amount) : '')
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? (initialName ? (suggestCategory(initialName) ?? 'bills') : 'bills'))
  const [paymentMethodId, setPaymentMethodId] = useState(item?.paymentMethodId ?? '')
  const [day, setDay] = useState(String(item?.dayOfMonth ?? 1))
  const [active, setActive] = useState(item?.active ?? true)
  const [errors, setErrors] = useState<{ name?: string; amount?: string }>({})

  async function save() {
    const amount = toPaise(amountText)
    const next: typeof errors = {}
    if (!name.trim()) next.name = 'Enter a name'
    if (amount <= 0) next.amount = 'Enter an amount'
    setErrors(next)
    if (Object.keys(next).length) return
    await saveRecurring(
      {
        name: name.trim(),
        amount,
        categoryId,
        paymentMethodId: paymentMethodId || null,
        dayOfMonth: Math.min(31, Math.max(1, Number(day) || 1)),
        active,
      },
      item?.id,
    )
    onClose()
    toast.success(item ? 'Recurring expense updated' : 'Recurring expense added')
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={item ? 'Edit recurring expense' : 'New recurring expense'}
      footer={
        <>
          {item ? (
            <Button
              type="button"
              variant="ghost"
              className="h-12 text-negative hover:text-negative"
              onClick={async () => {
                await deleteRecurring(item.id)
                onClose()
                toast('Recurring expense removed')
              }}
            >
              <Trash2 aria-hidden /> Delete
            </Button>
          ) : null}
          <Button type="submit" form="recurring-form" className="h-12 flex-1 text-base">
            Save
          </Button>
        </>
      }
    >
      <form
        id="recurring-form"
        className="space-y-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="rec-name">Name</Label>
          <Input id="rec-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rent" className="h-12" aria-invalid={Boolean(errors.name)} />
          {errors.name ? <p className="text-sm text-negative">{errors.name}</p> : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rec-amount">Amount</Label>
          <MoneyInput id="rec-amount" value={amountText} onChange={setAmountText} error={errors.amount} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rec-day">Day of month</Label>
            <Input id="rec-day" type="number" inputMode="numeric" min={1} max={31} value={day} onChange={(e) => setDay(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rec-category">Category</Label>
            <NativeSelect id="rec-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rec-method">Paid with</Label>
          <NativeSelect id="rec-method" value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}>
            <option value="">Default payment method</option>
            {methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="rec-active">Remind me every month</Label>
          <Switch id="rec-active" checked={active} onCheckedChange={setActive} />
        </div>
      </form>
    </FormSheet>
  )
}
