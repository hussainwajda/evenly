import { Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Chip } from '@/components/common'
import { FormSheet, MoneyInput } from '@/components/FormParts'
import { Avatar } from '@/components/PeoplePicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { db } from '@/db'
import { type GroupData, memberLabel, useGroupData } from '@/hooks/useGroups'
import { fromDateTimeLocal, toDateTimeLocal } from '@/lib/dates'
import type { SettlementMethod } from '@/lib/groupTypes'
import { formatINR, paiseToInput, toPaise } from '@/lib/money'
import { uid } from '@/lib/utils'
import { useUi } from '@/stores/ui'
import { saveSettlement } from '@/sync/groupEngine'

const METHODS: { value: SettlementMethod; label: string }[] = [
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'other', label: 'Other' },
]

export function SettleUpSheet() {
  const sheet = useUi((s) => s.settleSheet)
  const close = useUi((s) => s.closeSettle)
  const data = useGroupData(sheet.groupId)

  return (
    <FormSheet
      open={sheet.open}
      onOpenChange={(o) => !o && close()}
      title="Record a payment"
      description={data ? data.group.name : undefined}
      footer={
        <Button type="submit" form="settle-form" className="h-12 flex-1 text-base">
          Save payment
        </Button>
      }
    >
      {sheet.session > 0 && data ? <SettleForm key={sheet.session} data={data} initial={sheet} onDone={close} /> : null}
    </FormSheet>
  )
}

function SettleForm({
  data,
  initial,
  onDone,
}: {
  data: GroupData
  initial: { from: string | null; to: string | null; amount: number | null; expenseId: string | null }
  onDone: () => void
}) {
  const me = data.meId
  const suggested = data.transfers.find((t) => t.from === me) ?? data.transfers.find((t) => t.to === me) ?? data.transfers[0]
  const [from, setFrom] = useState(initial.from ?? suggested?.from ?? me ?? '')
  const [to, setTo] = useState(initial.to ?? suggested?.to ?? '')
  const [amountText, setAmountText] = useState(paiseToInput(initial.amount ?? suggested?.amount ?? 0))
  const [method, setMethod] = useState<SettlementMethod>('upi')
  const [occurredAt, setOccurredAt] = useState(() => Date.now())
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<{ people?: string; amount?: string }>({})

  const receiver = data.memberMap.get(to)
  const amount = toPaise(amountText)

  async function save() {
    const next: typeof errors = {}
    if (!from || !to) next.people = 'Choose who paid and who received'
    else if (from === to) next.people = 'Choose two different people'
    if (amount <= 0) next.amount = 'Enter an amount'
    setErrors(next)
    if (Object.keys(next).length) return
    await saveSettlement(db, {
      id: uid(),
      groupId: data.group.id,
      from,
      to,
      amount,
      method,
      occurredAt,
      note: note.trim(),
      expenseId: initial.expenseId,
      // The receiver recording it is proof enough; otherwise they can confirm or dispute it.
      status: to === me ? 'confirmed' : 'recorded',
    })
    onDone()
    toast.success(`${memberLabel(data, from)} paid ${memberLabel(data, to).replace(/^You$/, 'you')} ${formatINR(amount)}`)
  }

  const personChips = (value: string, onChange: (id: string) => void) => (
    <div className="flex flex-wrap gap-2">
      {data.activeMembers.map((m) => (
        <Chip key={m.id} selected={value === m.id} onClick={() => onChange(m.id)} className="pl-1.5">
          <Avatar name={m.displayName} />
          {m.id === me ? 'You' : m.displayName}
        </Chip>
      ))}
    </div>
  )

  return (
    <form
      id="settle-form"
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      {data.transfers.length ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Suggested</legend>
          <div className="flex flex-wrap gap-2">
            {data.transfers.map((t) => (
              <Chip
                key={`${t.from}>${t.to}`}
                selected={from === t.from && to === t.to && amount === t.amount}
                onClick={() => {
                  setFrom(t.from)
                  setTo(t.to)
                  setAmountText(paiseToInput(t.amount))
                }}
              >
                {memberLabel(data, t.from)} → {memberLabel(data, t.to)} {formatINR(t.amount)}
              </Chip>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="rounded-xl bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">Everyone is settled up. You can still record a payment.</p>
      )}

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Who paid?</legend>
        {personChips(from, setFrom)}
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Who received it?</legend>
        {personChips(to, setTo)}
        {errors.people ? <p className="mt-2 text-sm text-negative">{errors.people}</p> : null}
      </fieldset>

      <div>
        <Label htmlFor="settle-amount" className="text-muted-foreground">
          Amount
        </Label>
        <MoneyInput id="settle-amount" large value={amountText} onChange={setAmountText} error={errors.amount} className="mt-1" />
      </div>

      {receiver?.upiId && from === me && to !== me ? (
        <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{receiver.displayName}'s UPI ID</p>
            <p className="truncate font-medium">{receiver.upiId}</p>
            <p className="text-xs text-muted-foreground">Pay in your UPI app, then save here.</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="h-11"
            onClick={async () => {
              await navigator.clipboard.writeText(receiver.upiId!)
              toast.success('UPI ID copied')
            }}
          >
            <Copy aria-hidden /> Copy
          </Button>
        </div>
      ) : null}

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Via</legend>
        <div className="flex flex-wrap gap-2">
          {METHODS.map((m) => (
            <Chip key={m.value} selected={method === m.value} onClick={() => setMethod(m.value)}>
              {m.label}
            </Chip>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="settle-when">When</Label>
          <Input
            id="settle-when"
            type="datetime-local"
            value={toDateTimeLocal(occurredAt)}
            onChange={(e) => e.target.value && setOccurredAt(fromDateTimeLocal(e.target.value))}
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="settle-note">Note</Label>
          <Input id="settle-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className="h-11" />
        </div>
      </div>
    </form>
  )
}
