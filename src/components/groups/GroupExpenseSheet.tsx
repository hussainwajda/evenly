import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Minus, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/CategoryIcon'
import { Chip, Segmented } from '@/components/common'
import { FormSheet, MoneyInput } from '@/components/FormParts'
import { Avatar } from '@/components/PeoplePicker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { db } from '@/db'
import { useCategories } from '@/hooks/useData'
import { useGroupData, useGroupSummaries } from '@/hooks/useGroups'
import { FALLBACK_CATEGORY_ID, suggestCategory } from '@/lib/categorize'
import { fromDateTimeLocal, startOfDay, toDateTimeLocal } from '@/lib/dates'
import { computeGroupShares, largestRemainder } from '@/lib/groupMath'
import type { GroupSplitMethod } from '@/lib/groupTypes'
import { formatINR, paiseToInput, toPaise } from '@/lib/money'
import { cn, uid } from '@/lib/utils'
import { type GroupExpensePreset, useUi } from '@/stores/ui'
import { deleteGroupExpense, restoreGroupExpense, saveGroupExpense } from '@/sync/groupEngine'

const METHODS: { value: GroupSplitMethod; label: string }[] = [
  { value: 'equal', label: 'Equally' },
  { value: 'exact', label: 'Amounts' },
  { value: 'percent', label: 'Percent' },
  { value: 'shares', label: 'Shares' },
]

const shortName = (name: string) => name.split(' & ')[0]

export function GroupExpenseSheet() {
  const sheet = useUi((s) => s.groupExpenseSheet)
  const close = useUi((s) => s.closeGroupExpense)

  async function remove() {
    const id = sheet.editId
    if (!id) return
    await deleteGroupExpense(db, id)
    close()
    toast('Shared expense deleted for everyone', { action: { label: 'Undo', onClick: () => void restoreGroupExpense(db, id) } })
  }

  return (
    <FormSheet
      open={sheet.open}
      onOpenChange={(o) => !o && close()}
      title={sheet.editId ? 'Edit shared expense' : 'Add shared expense'}
      footer={
        <>
          {sheet.editId ? (
            <Button type="button" variant="ghost" className="h-12 text-negative hover:text-negative" onClick={() => void remove()}>
              <Trash2 aria-hidden /> Delete
            </Button>
          ) : null}
          <Button type="submit" form="group-expense-form" className="h-12 flex-1 text-base">
            {sheet.editId ? 'Save changes' : 'Add expense'}
          </Button>
        </>
      }
    >
      {sheet.session > 0 ? (
        <GroupExpenseForm key={sheet.session} initialGroupId={sheet.groupId} editId={sheet.editId} preset={sheet.preset} onDone={close} />
      ) : null}
    </FormSheet>
  )
}

function GroupExpenseForm({
  initialGroupId,
  editId,
  preset,
  onDone,
}: {
  initialGroupId: string | null
  editId: string | null
  preset: GroupExpensePreset | null
  onDone: () => void
}) {
  const summaries = useGroupSummaries()
  const categories = useCategories()
  const activeCategories = useMemo(() => categories.filter((c) => !c.archived), [categories])
  const existing = useLiveQuery(() => (editId ? db.groupExpenses.get(editId) : undefined), [editId])

  const [groupId, setGroupId] = useState(initialGroupId ?? '')
  useEffect(() => {
    if (!groupId && summaries?.length) setGroupId(summaries[0].group.id)
  }, [groupId, summaries])
  const data = useGroupData(groupId || null)

  const [title, setTitle] = useState(preset?.title ?? '')
  const [amountText, setAmountText] = useState(preset?.amount ? paiseToInput(preset.amount) : '')
  const [categoryId, setCategoryId] = useState(preset?.categoryId ?? '')
  const [categoryTouched, setCategoryTouched] = useState(Boolean(preset?.categoryId))
  const [occurredAt, setOccurredAt] = useState(() => preset?.occurredAt ?? Date.now())
  const [note, setNote] = useState('')
  const [payerId, setPayerId] = useState('')
  const [method, setMethod] = useState<GroupSplitMethod>('equal')
  const [included, setIncluded] = useState<Set<string>>(new Set())
  const [values, setValues] = useState<Record<string, string>>({})
  const [initKey, setInitKey] = useState<string | null>(null)
  const [errors, setErrors] = useState<{ title?: string; amount?: string; split?: string }>({})
  const [saving, setSaving] = useState(false)

  // Initialise once the group's members (and the expense being edited) are available.
  useEffect(() => {
    if (!data) return
    const key = `${data.group.id}|${editId ?? ''}`
    if (initKey === key) return
    if (editId && existing === undefined) return
    if (existing && existing.groupId === data.group.id) {
      setTitle(existing.title)
      setAmountText(paiseToInput(existing.amount))
      setCategoryId(existing.categoryId)
      setCategoryTouched(true)
      setOccurredAt(existing.occurredAt)
      setNote(existing.note)
      setPayerId(existing.payers[0]?.memberId ?? data.meId ?? '')
      setMethod(existing.split.method)
      setIncluded(new Set(existing.split.entries.filter((e) => e.value > 0).map((e) => e.memberId)))
      setValues(
        Object.fromEntries(
          existing.split.entries.map((e) => [
            e.memberId,
            existing.split.method === 'exact' ? paiseToInput(e.value) : existing.split.method === 'percent' ? String(e.value / 100) : String(e.value),
          ]),
        ),
      )
    } else {
      setPayerId(data.meId ?? data.activeMembers[0]?.id ?? '')
      setIncluded(new Set(data.activeMembers.map((m) => m.id)))
      setValues({})
      setMethod('equal')
    }
    setInitKey(key)
  }, [data, existing, editId, initKey])

  // Auto-pick a category from the title until the user picks one.
  useEffect(() => {
    if (categoryTouched || !title.trim()) return
    const guess = suggestCategory(title, activeCategories)
    if (guess) setCategoryId(guess)
  }, [title, categoryTouched, activeCategories])

  const participants = useMemo(() => {
    if (!data) return []
    const inExpense = new Set(existing?.shares.map((s) => s.memberId) ?? [])
    return data.members.filter((m) => !m.leftAt || inExpense.has(m.id))
  }, [data, existing])

  const total = toPaise(amountText)
  const entries = participants.map((m) => {
    const raw = values[m.id] ?? ''
    const num = Number.parseFloat(raw) || 0
    const value =
      method === 'equal'
        ? included.has(m.id)
          ? 1
          : 0
        : method === 'exact'
          ? toPaise(raw)
          : method === 'percent'
            ? Math.round(num * 100)
            : Math.max(0, Math.round(num))
    return { memberId: m.id, value }
  })
  const result = computeGroupShares(method, total, entries)
  const shareOf = (memberId: string) => result.shares.find((s) => s.memberId === memberId)?.amount ?? 0
  const now = Date.now()

  function changeMethod(next: GroupSplitMethod) {
    const chosen = participants.filter((m) => included.has(m.id))
    const pool = chosen.length ? chosen : participants
    if (next === 'percent') {
      const bp = largestRemainder(10000, pool.map(() => 1))
      setValues(Object.fromEntries(pool.map((m, i) => [m.id, String(bp[i] / 100)])))
    } else if (next === 'shares') {
      setValues(Object.fromEntries(participants.map((m) => [m.id, pool.includes(m) ? '1' : '0'])))
    } else if (next === 'exact') {
      setValues({})
    }
    setMethod(next)
    setErrors((e) => ({ ...e, split: undefined }))
  }

  const setValue = (memberId: string, v: string) => setValues((x) => ({ ...x, [memberId]: v }))

  async function save() {
    if (!data || saving) return
    const next: typeof errors = {}
    if (!title.trim()) next.title = 'What was it for?'
    if (total <= 0) next.amount = 'Enter an amount'
    else if (result.error) next.split = result.error
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    try {
      const name = title.trim().replace(/\s+/g, ' ')
      await saveGroupExpense(db, {
        id: editId ?? uid(),
        groupId: data.group.id,
        title: name.charAt(0).toUpperCase() + name.slice(1),
        amount: total,
        categoryId: categoryId || suggestCategory(name, activeCategories) || FALLBACK_CATEGORY_ID,
        occurredAt,
        note: note.trim(),
        createdBy: existing?.createdBy ?? data.meId ?? payerId,
        payers: [{ memberId: payerId, amount: total }],
        split: { method, entries: entries.filter((e) => e.value > 0) },
        shares: result.shares,
      })
      onDone()
      const mine = data.meId ? shareOf(data.meId) : 0
      toast.success(`${editId ? 'Updated' : 'Added'} in ${data.group.name}${mine ? ` · your share ${formatINR(mine)}` : ''}`)
    } finally {
      setSaving(false)
    }
  }

  if (summaries && !summaries.length && !initialGroupId) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        You're not in any group yet.{' '}
        <Link to="/people" onClick={onDone} className="font-medium text-brand">
          Create one
        </Link>
      </p>
    )
  }

  return (
    <form
      id="group-expense-form"
      className="space-y-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      {!editId && summaries && summaries.length > 1 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Group</legend>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
            {summaries.map((s) => (
              <Chip key={s.group.id} selected={s.group.id === groupId} onClick={() => setGroupId(s.group.id)}>
                {s.group.name}
              </Chip>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div>
        <Label htmlFor="gexp-amount" className="text-muted-foreground">
          Total bill
        </Label>
        <MoneyInput
          id="gexp-amount"
          large
          value={amountText}
          onChange={(v) => {
            setAmountText(v)
            if (errors.amount) setErrors((x) => ({ ...x, amount: undefined }))
          }}
          error={errors.amount}
          className="mt-1"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="gexp-title">What was it for?</Label>
        <Input
          id="gexp-title"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            if (errors.title) setErrors((x) => ({ ...x, title: undefined }))
          }}
          placeholder="Dinner, groceries, cab…"
          className="h-12 text-base"
          aria-invalid={Boolean(errors.title)}
        />
        {errors.title ? <p className="text-sm text-negative">{errors.title}</p> : null}
      </div>

      {data ? (
        <>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Paid by</legend>
            <div className="flex flex-wrap gap-2">
              {participants.map((m) => (
                <Chip key={m.id} selected={payerId === m.id} onClick={() => setPayerId(m.id)} className="pl-1.5">
                  <Avatar name={m.displayName} />
                  {m.id === data.meId ? 'You' : m.displayName}
                </Chip>
              ))}
            </div>
          </fieldset>

          <div className="space-y-3">
            <p className="text-sm font-medium">Split</p>
            <Segmented label="Split method" value={method} onChange={changeMethod} options={METHODS} />
            {method === 'equal' ? (
              <div className="flex flex-wrap gap-2">
                <Chip onClick={() => setIncluded(new Set(participants.map((m) => m.id)))}>Everyone</Chip>
                {data.meId && payerId !== data.meId ? (
                  <Chip onClick={() => setIncluded(new Set([data.meId!, payerId]))}>Just you & {data.memberMap.get(payerId)?.displayName ?? 'payer'}</Chip>
                ) : null}
              </div>
            ) : null}
            <ul className="divide-y rounded-2xl border bg-card">
              {participants.map((m) => {
                const checked = included.has(m.id)
                const name = m.id === data.meId ? `${m.displayName} (you)` : m.displayName
                const n = Math.max(0, Math.round(Number.parseFloat(values[m.id] ?? '0') || 0))
                return (
                  <li key={m.id} className="flex min-h-14 items-center gap-3 px-3 py-2">
                    {method === 'equal' ? (
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() =>
                          setIncluded((s) => {
                            const next = new Set(s)
                            if (next.has(m.id)) next.delete(m.id)
                            else next.add(m.id)
                            return next
                          })
                        }
                        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <span
                          className={cn(
                            'grid size-5 shrink-0 place-items-center rounded border',
                            checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                          )}
                          aria-hidden
                        >
                          {checked ? <Check className="size-3.5" /> : null}
                        </span>
                        <Avatar name={m.displayName} />
                        <span className="truncate text-sm">{name}</span>
                      </button>
                    ) : (
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <Avatar name={m.displayName} />
                        <span className="truncate text-sm">{name}</span>
                      </div>
                    )}

                    {method === 'exact' ? (
                      <MoneyInput id={`gexp-exact-${m.id}`} value={values[m.id] ?? ''} onChange={(v) => setValue(m.id, v)} className="w-32" aria-label={`Amount for ${m.displayName}`} />
                    ) : null}
                    {method === 'percent' ? (
                      <div className="flex items-center gap-1">
                        <Input
                          inputMode="decimal"
                          value={values[m.id] ?? ''}
                          onChange={(e) => setValue(m.id, e.target.value.replace(/[^\d.]/g, ''))}
                          aria-label={`Percent for ${m.displayName}`}
                          className="h-11 w-20 text-right"
                          placeholder="0"
                        />
                        <span className="text-sm text-muted-foreground" aria-hidden>
                          %
                        </span>
                      </div>
                    ) : null}
                    {method === 'shares' ? (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-11 rounded-full"
                          aria-label={`Fewer shares for ${m.displayName}`}
                          onClick={() => setValue(m.id, String(Math.max(0, n - 1)))}
                        >
                          <Minus aria-hidden />
                        </Button>
                        <span className="money w-6 text-center font-medium" aria-live="polite">
                          {n}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-11 rounded-full"
                          aria-label={`More shares for ${m.displayName}`}
                          onClick={() => setValue(m.id, String(n + 1))}
                        >
                          <Plus aria-hidden />
                        </Button>
                      </div>
                    ) : null}

                    <span className="money w-20 shrink-0 text-right text-sm font-medium">{formatINR(shareOf(m.id))}</span>
                  </li>
                )
              })}
            </ul>
            {total > 0 && (errors.split || result.error) ? (
              <p className={cn('text-sm', errors.split ? 'text-negative' : 'text-warning')} role={errors.split ? 'alert' : undefined}>
                {errors.split ?? result.error}
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Loading group…</p>
      )}

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Category</legend>
        <div className="grid grid-cols-4 gap-1.5">
          {activeCategories.map((c) => {
            const selected = c.id === categoryId
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={selected}
                aria-label={c.name}
                onClick={() => {
                  setCategoryId(c.id)
                  setCategoryTouched(true)
                }}
                className={cn(
                  'flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border px-1 py-2 text-xs font-medium transition-colors',
                  selected ? 'border-brand bg-brand/10 text-foreground' : 'border-transparent text-muted-foreground hover:bg-accent',
                )}
              >
                <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                <span className="line-clamp-1 w-full text-center">{shortName(c.name)}</span>
              </button>
            )
          })}
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
        <Label htmlFor="gexp-note">Note</Label>
        <Input id="gexp-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className="h-11" />
      </div>
    </form>
  )
}
