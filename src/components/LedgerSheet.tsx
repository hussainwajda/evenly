import { useLiveQuery } from 'dexie-react-hooks'
import { Link2, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Chip, Segmented } from '@/components/common'
import { FormSheet, MoneyInput } from '@/components/FormParts'
import { PeoplePicker } from '@/components/PeoplePicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { db } from '@/db'
import { deleteLedgerEntry, restoreLedgerEntry, saveLedgerEntry } from '@/db/repo'
import { useBalances, usePaymentMethods, usePeopleMap } from '@/hooks/useData'
import { fromDateTimeLocal, startOfDay, toDateTimeLocal } from '@/lib/dates'
import { LEDGER_SIGN } from '@/lib/ledger'
import { formatINR, paiseToInput, toPaise } from '@/lib/money'
import type { LedgerType } from '@/lib/types'
import { useUi } from '@/stores/ui'

const TYPE_OPTIONS: { value: LedgerType; label: string }[] = [
  { value: 'lent', label: 'I lent' },
  { value: 'borrowed', label: 'I borrowed' },
  { value: 'received', label: 'Got back' },
  { value: 'repaid', label: 'Paid back' },
]

const TYPE_HINT: Record<LedgerType, string> = {
  lent: 'You gave money or paid for them.',
  borrowed: 'They gave you money or paid for you.',
  received: 'They returned money they owed you.',
  repaid: 'You returned money you owed them.',
}

export function LedgerSheet() {
  const sheet = useUi((s) => s.ledgerSheet)
  const close = useUi((s) => s.closeLedger)
  return (
    <FormSheet
      open={sheet.open}
      onOpenChange={(o) => !o && close()}
      title={sheet.editId ? 'Edit entry' : 'Borrow or lend'}
      footer={
        <>
          {sheet.editId ? <DeleteLedgerButton id={sheet.editId} onDone={close} /> : null}
          <Button type="submit" form="ledger-form" className="h-12 flex-1 text-base">
            {sheet.editId ? 'Save changes' : 'Save entry'}
          </Button>
        </>
      }
    >
      {sheet.session > 0 ? (
        <LedgerForm
          key={sheet.session}
          editId={sheet.editId}
          initialPersonId={sheet.personId}
          initialType={sheet.type}
          initialAmount={sheet.amount}
          onDone={close}
        />
      ) : null}
    </FormSheet>
  )
}

function DeleteLedgerButton({ id, onDone }: { id: string; onDone: () => void }) {
  const entry = useLiveQuery(() => db.ledger.get(id), [id])
  if (entry?.transactionId) return null
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-12 text-negative hover:text-negative"
      onClick={async () => {
        await deleteLedgerEntry(id)
        onDone()
        toast('Entry deleted', { action: { label: 'Undo', onClick: () => void restoreLedgerEntry(id) } })
      }}
    >
      <Trash2 aria-hidden /> Delete
    </Button>
  )
}

function LedgerForm({
  editId,
  initialPersonId,
  initialType,
  initialAmount,
  onDone,
}: {
  editId: string | null
  initialPersonId: string | null
  initialType: LedgerType | null
  initialAmount: number | null
  onDone: () => void
}) {
  const methods = usePaymentMethods()
  const peopleMap = usePeopleMap()
  const balances = useBalances()
  const openExpense = useUi((s) => s.openExpense)
  const existing = useLiveQuery(() => (editId ? db.ledger.get(editId) : undefined), [editId])
  const amountRef = useRef<HTMLInputElement>(null)

  const [loaded, setLoaded] = useState(!editId)
  const [type, setType] = useState<LedgerType>(initialType ?? 'lent')
  const [personIds, setPersonIds] = useState<string[]>(initialPersonId ? [initialPersonId] : [])
  const [amountText, setAmountText] = useState(initialAmount ? paiseToInput(initialAmount) : '')
  const [occurredAt, setOccurredAt] = useState(() => Date.now())
  const [note, setNote] = useState('')
  const [paymentMethodId, setPaymentMethodId] = useState<string | null>(null)
  const [errors, setErrors] = useState<{ amount?: string; person?: string }>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editId || !existing || loaded) return
    setType(existing.type)
    setPersonIds([existing.personId])
    setAmountText(paiseToInput(existing.amount))
    setOccurredAt(existing.occurredAt)
    setNote(existing.note)
    setPaymentMethodId(existing.paymentMethodId)
    setLoaded(true)
  }, [editId, existing, loaded])

  if (existing?.transactionId) {
    return (
      <div className="space-y-4 py-2">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Link2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          This entry was created from a split or paid-by expense. Edit the expense to change it.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="h-11 w-full"
          onClick={() => {
            onDone()
            openExpense({ editId: existing.transactionId! })
          }}
        >
          Open expense
        </Button>
      </div>
    )
  }

  const pid = personIds[0]
  const person = pid ? peopleMap.get(pid) : undefined
  const amount = toPaise(amountText)
  let before = pid ? (balances.get(pid) ?? 0) : 0
  if (existing && !existing.deletedAt && existing.personId === pid) before -= LEDGER_SIGN[existing.type] * existing.amount
  const after = before + LEDGER_SIGN[type] * amount
  const now = Date.now()

  async function save() {
    const next: typeof errors = {}
    if (amount <= 0) next.amount = 'Enter an amount'
    if (!pid) next.person = 'Choose a person'
    setErrors(next)
    if (Object.keys(next).length) {
      if (next.amount) amountRef.current?.focus()
      return
    }
    setSaving(true)
    try {
      const id = await saveLedgerEntry({ personId: pid, type, amount, occurredAt, note, paymentMethodId }, editId ?? undefined)
      onDone()
      toast.success(`${TYPE_OPTIONS.find((t) => t.value === type)?.label} ${formatINR(amount)} · ${person?.name ?? ''}`, {
        action: editId ? undefined : { label: 'Undo', onClick: () => void deleteLedgerEntry(id) },
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      id="ledger-form"
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (!saving) void save()
      }}
    >
      <div className="space-y-2">
        <Segmented label="Entry type" value={type} onChange={setType} options={TYPE_OPTIONS} />
        <p className="text-sm text-muted-foreground">{TYPE_HINT[type]}</p>
      </div>

      <div>
        <Label htmlFor="ledger-amount" className="text-muted-foreground">
          Amount
        </Label>
        <MoneyInput
          id="ledger-amount"
          large
          inputRef={amountRef}
          value={amountText}
          onChange={(v) => {
            setAmountText(v)
            if (errors.amount) setErrors((x) => ({ ...x, amount: undefined }))
          }}
          error={errors.amount}
          className="mt-1"
        />
      </div>

      <PeoplePicker
        label="With"
        single
        selected={personIds}
        onChange={(ids) => {
          setPersonIds(ids)
          if (errors.person) setErrors((x) => ({ ...x, person: undefined }))
        }}
        error={errors.person}
      />

      {person && amount > 0 ? (
        <p className="rounded-xl bg-muted/60 px-3 py-2.5 text-sm">
          {after > 0 ? (
            <>
              {person.name} will owe you <span className="money font-semibold text-positive">{formatINR(after)}</span>
            </>
          ) : after < 0 ? (
            <>
              You'll owe {person.name} <span className="money font-semibold text-negative">{formatINR(-after)}</span>
            </>
          ) : (
            <>You and {person.name} will be settled up.</>
          )}
        </p>
      ) : null}

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Via (optional)</legend>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {methods
            .filter((m) => !m.archived || m.id === paymentMethodId)
            .map((m) => (
              <Chip key={m.id} selected={m.id === paymentMethodId} onClick={() => setPaymentMethodId(m.id === paymentMethodId ? null : m.id)}>
                {m.label}
              </Chip>
            ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">When</legend>
        <div className="flex flex-wrap items-center gap-2">
          <Chip selected={startOfDay(occurredAt) === startOfDay(now)} onClick={() => setOccurredAt(Date.now())}>
            Today
          </Chip>
          <Input
            type="datetime-local"
            aria-label="Date and time"
            value={toDateTimeLocal(occurredAt)}
            onChange={(e) => e.target.value && setOccurredAt(fromDateTimeLocal(e.target.value))}
            className="h-11 w-auto min-w-0 flex-1 rounded-full"
          />
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="ledger-note">Note</Label>
        <Input id="ledger-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional, e.g. wifi share" className="h-11" />
      </div>
    </form>
  )
}
