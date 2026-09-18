import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronDown, Trash2, Users, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/CategoryIcon'
import { Chip, Segmented } from '@/components/common'
import { BOTTOM_SHEET_CLASS, SIDE_SHEET_CLASS } from '@/components/FormParts'
import { PeoplePicker } from '@/components/PeoplePicker'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { db } from '@/db'
import { deleteExpense, learnedCategory, nameSuggestions, restoreExpense, saveExpense, saveRecurring } from '@/db/repo'
import { useCategories, usePaymentMethods, usePeopleMap, useSettings } from '@/hooks/useData'
import { FALLBACK_CATEGORY_ID, suggestCategory } from '@/lib/categorize'
import { fromDateTimeLocal, monthKeyOf, startOfDay, toDateTimeLocal } from '@/lib/dates'
import { formatINR, paiseToInput, splitEvenly, toPaise } from '@/lib/money'
import { parseQuickAdd } from '@/lib/quickAdd'
import { computeShares } from '@/lib/split'
import { cn } from '@/lib/utils'
import { type ExpensePreset, type SplitMode, useUi } from '@/stores/ui'

export function ExpenseSheet() {
  const { open, session, editId, preset } = useUi((s) => s.expenseSheet)
  const close = useUi((s) => s.closeExpense)
  const amountRef = useRef<HTMLInputElement>(null)
  const isDesktop = useIsDesktop()

  return (
    <Drawer open={open} onOpenChange={(o) => !o && close()} direction={isDesktop ? 'right' : 'bottom'}>
      <DrawerContent
        className={isDesktop ? SIDE_SHEET_CLASS : BOTTOM_SHEET_CLASS}
        onOpenAutoFocus={(e) => {
          if (editId) return
          e.preventDefault()
          amountRef.current?.focus()
        }}
      >
        {session > 0 ? (
          <ExpenseForm key={session} editId={editId} preset={preset} onDone={close} amountRef={amountRef} />
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}

const MODE_OPTIONS: { value: SplitMode; label: string }[] = [
  { value: 'solo', label: 'Just me' },
  { value: 'split', label: 'Split' },
  { value: 'for', label: 'For them' },
  { value: 'paidBy', label: 'They paid' },
]

function shortName(name: string) {
  return name.split(' & ')[0]
}

/** "chai" → "Chai"; keeps the rest as typed ("KFC", "Pizza Hut"). */
function capitalise(name: string) {
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : name
}

interface Errors {
  amount?: string
  name?: string
  people?: string
}

function ExpenseForm({
  editId,
  preset,
  onDone,
  amountRef,
}: {
  editId: string | null
  preset: ExpensePreset | null
  onDone: () => void
  amountRef: React.RefObject<HTMLInputElement | null>
}) {
  const settings = useSettings()
  const categories = useCategories()
  const activeCategories = useMemo(() => categories.filter((c) => !c.archived), [categories])
  const allMethods = usePaymentMethods()
  const peopleMap = usePeopleMap()
  const existing = useLiveQuery(() => (editId ? db.transactions.get(editId) : undefined), [editId])
  const groupChoices = useLiveQuery(() => db.groups.toArray(), [], [])
  const openGroupExpense = useUi((s) => s.openGroupExpense)
  const nameRef = useRef<HTMLInputElement>(null)

  const [loaded, setLoaded] = useState(!editId)
  const [amountText, setAmountText] = useState(preset?.amount ? paiseToInput(preset.amount) : '')
  const [name, setName] = useState(preset?.name ?? '')
  const [categoryId, setCategoryId] = useState(preset?.categoryId ?? '')
  const [categoryTouched, setCategoryTouched] = useState(Boolean(preset?.categoryId))
  const [paymentMethodId, setPaymentMethodId] = useState(settings.defaultPaymentMethodId)
  const [methodTouched, setMethodTouched] = useState(false)
  const [occurredAt, setOccurredAt] = useState(() => Date.now())
  const [note, setNote] = useState('')
  const [mode, setMode] = useState<SplitMode>(preset?.mode ?? 'solo')
  const [personIds, setPersonIds] = useState<string[]>(preset?.personId ? [preset.personId] : [])
  const [myShareText, setMyShareText] = useState('')
  const [excludeFromSpend, setExcludeFromSpend] = useState(false)
  const [repeatMonthly, setRepeatMonthly] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)

  const methods = useMemo(
    () => allMethods.filter((m) => !m.archived || m.id === paymentMethodId),
    [allMethods, paymentMethodId],
  )

  // Default payment method arrives after settings load.
  useEffect(() => {
    if (!editId && !methodTouched) setPaymentMethodId(settings.defaultPaymentMethodId)
  }, [settings.defaultPaymentMethodId, editId, methodTouched])

  // Load the expense being edited.
  useEffect(() => {
    if (!editId || !existing || loaded) return
    setAmountText(paiseToInput(existing.grossAmount))
    setName(existing.name)
    setCategoryId(existing.categoryId)
    setCategoryTouched(true)
    if (existing.paymentMethodId) setPaymentMethodId(existing.paymentMethodId)
    setMethodTouched(true)
    setOccurredAt(existing.occurredAt)
    setNote(existing.note)
    setExcludeFromSpend(existing.excludeFromSpend)
    if (existing.paidByPersonId) {
      setMode('paidBy')
      setPersonIds([existing.paidByPersonId])
      if (existing.amount !== existing.grossAmount) setMyShareText(paiseToInput(existing.amount))
    } else if (existing.shares.length) {
      setPersonIds(existing.shares.map((s) => s.personId))
      if (existing.amount === 0) setMode('for')
      else {
        setMode('split')
        const auto = splitEvenly(existing.grossAmount, existing.shares.length + 1)[0]
        if (auto !== existing.amount) setMyShareText(paiseToInput(existing.amount))
      }
    }
    if (existing.note || existing.excludeFromSpend) setShowMore(true)
    setLoaded(true)
  }, [editId, existing, loaded])

  // Auto-pick a category from history, then keyword rules, until the user picks one.
  useEffect(() => {
    if (categoryTouched) return
    const n = parseQuickAdd(name)?.name ?? name
    if (!n.trim()) return
    let cancelled = false
    const t = window.setTimeout(async () => {
      const guess = (await learnedCategory(n)) ?? suggestCategory(n, activeCategories)
      if (!cancelled && guess) setCategoryId(guess)
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [name, categoryTouched, activeCategories])

  const suggestions = useLiveQuery(() => nameSuggestions(name), [name], [])
  const visibleSuggestions = suggestions.filter((s) => s.name.toLowerCase() !== name.trim().toLowerCase()).slice(0, 5)

  const total = toPaise(amountText)
  const myShareOverride = myShareText.trim() ? toPaise(myShareText) : null
  const split = computeShares(mode, total, personIds, mode === 'split' || mode === 'paidBy' ? myShareOverride : null)

  const now = Date.now()
  const isToday = startOfDay(occurredAt) === startOfDay(now)
  const isYesterday = startOfDay(occurredAt) === startOfDay(now - 86_400_000)

  function applyQuickAdd(): { name: string; total: number } {
    const parsed = parseQuickAdd(name)
    if (parsed && (!amountText || toPaise(amountText) === parsed.amount)) {
      setName(parsed.name)
      setAmountText(paiseToInput(parsed.amount))
      return { name: capitalise(parsed.name), total: parsed.amount }
    }
    return { name: capitalise(name.trim()), total }
  }

  function shareInGroup(groupId: string) {
    const q = applyQuickAdd()
    onDone()
    openGroupExpense({
      groupId,
      preset: { title: q.name || undefined, amount: q.total || undefined, categoryId: categoryId || undefined, occurredAt },
    })
  }

  function changeMode(next: SplitMode) {
    setMode(next)
    setMyShareText('')
    setErrors((e) => ({ ...e, people: undefined }))
    if (next === 'paidBy' && personIds.length > 1) setPersonIds(personIds.slice(0, 1))
  }

  async function handleSave() {
    if (saving) return
    const q = applyQuickAdd()
    const nextErrors: Errors = {}
    if (q.total <= 0) nextErrors.amount = 'Enter an amount'
    if (!q.name) nextErrors.name = 'Add a name, for example “Chai”'
    if (mode !== 'solo' && personIds.length === 0) nextErrors.people = mode === 'paidBy' ? 'Choose who paid' : 'Choose at least one person'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      if (nextErrors.amount) amountRef.current?.focus()
      else if (nextErrors.name) nameRef.current?.focus()
      return
    }

    setSaving(true)
    try {
      const finalCategory =
        categoryId || (await learnedCategory(q.name)) || suggestCategory(q.name, activeCategories) || FALLBACK_CATEGORY_ID
      const s = computeShares(mode, q.total, personIds, mode === 'split' || mode === 'paidBy' ? myShareOverride : null)
      const id = await saveExpense(
        {
          name: q.name,
          amount: s.my,
          grossAmount: q.total,
          categoryId: finalCategory,
          paymentMethodId: mode === 'paidBy' ? null : paymentMethodId,
          occurredAt,
          note,
          excludeFromSpend,
          paidByPersonId: mode === 'paidBy' ? personIds[0] : null,
          shares: s.shares,
        },
        editId ?? undefined,
      )
      if (repeatMonthly && !editId) {
        const recId = await saveRecurring({
          name: q.name,
          amount: s.my,
          categoryId: finalCategory,
          paymentMethodId: mode === 'paidBy' ? null : paymentMethodId,
          dayOfMonth: new Date(occurredAt).getDate(),
          active: true,
        })
        await db.recurring.update(recId, { lastAddedMonthKey: monthKeyOf(occurredAt, settings.monthStartDay) })
      }
      onDone()
      toast.success(`${editId ? 'Updated' : 'Saved'} ${formatINR(s.my)} · ${q.name}`, {
        action: editId ? undefined : { label: 'Undo', onClick: () => void deleteExpense(id) },
      })
    } catch (err) {
      toast.error('Could not save. Please try again.')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!editId) return
    await deleteExpense(editId)
    onDone()
    toast('Expense deleted', { action: { label: 'Undo', onClick: () => void restoreExpense(editId) } })
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void handleSave()
      }}
      className="flex min-h-0 flex-1 flex-col"
      noValidate
    >
      <DrawerHeader className="flex-row items-center justify-between gap-2 px-4 pb-2 pt-2 text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
        <div>
          <DrawerTitle className="text-lg">{editId ? 'Edit expense' : 'Add expense'}</DrawerTitle>
          <DrawerDescription className="sr-only">Amount, what it was for, category, and who was involved.</DrawerDescription>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-11 rounded-full" aria-label="Close" onClick={onDone}>
          <X className="size-5" />
        </Button>
      </DrawerHeader>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-4">
        {/* Amount */}
        <div>
          <Label htmlFor="exp-amount" className="text-muted-foreground">
            {mode === 'solo' ? 'Amount' : 'Total bill'}
          </Label>
          <div
            className={cn(
              'mt-1 flex items-center gap-1 border-b-2 pb-1 transition-colors focus-within:border-brand',
              errors.amount ? 'border-negative' : 'border-border',
            )}
          >
            <span className="text-3xl font-semibold text-muted-foreground" aria-hidden>
              ₹
            </span>
            <input
              ref={amountRef}
              id="exp-amount"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="next"
              placeholder="0"
              value={amountText}
              aria-invalid={Boolean(errors.amount)}
              aria-describedby={errors.amount ? 'exp-amount-err' : undefined}
              onChange={(e) => {
                setAmountText(e.target.value.replace(/[^\d.]/g, ''))
                if (errors.amount) setErrors((x) => ({ ...x, amount: undefined }))
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  nameRef.current?.focus()
                }
              }}
              className="w-full min-w-0 bg-transparent text-4xl font-semibold outline-none placeholder:text-muted-foreground/50"
            />
          </div>
          {errors.amount ? (
            <p id="exp-amount-err" className="mt-1 text-sm text-negative">
              {errors.amount}
            </p>
          ) : null}
          {mode !== 'solo' && total > 0 ? (
            <p className="mt-1.5 text-sm text-muted-foreground">
              Your share <span className="money font-semibold text-foreground">{formatINR(split.my)}</span>
              {split.shares.length ? ` · others ${formatINR(split.shares.reduce((a, s) => a + s.amount, 0))}` : ''}
            </p>
          ) : null}
        </div>

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="exp-name">What was it for?</Label>
          <Input
            ref={nameRef}
            id="exp-name"
            value={name}
            placeholder="Chai, petrol, rent… or type “chai 12”"
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="done"
            className="h-12 text-base"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'exp-name-err' : 'exp-name-hint'}
            onChange={(e) => {
              setName(e.target.value)
              if (errors.name) setErrors((x) => ({ ...x, name: undefined }))
            }}
            onBlur={() => applyQuickAdd()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                applyQuickAdd()
                ;(e.target as HTMLInputElement).blur()
              }
            }}
          />
          {errors.name ? (
            <p id="exp-name-err" className="text-sm text-negative">
              {errors.name}
            </p>
          ) : (
            <p id="exp-name-hint" className="sr-only">
              Typing a name and amount together, like chai 12, fills both fields.
            </p>
          )}
          {visibleSuggestions.length ? (
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" aria-label="Recent names">
              {visibleSuggestions.map((s) => {
                const cat = categories.find((c) => c.id === s.categoryId)
                return (
                  <Chip
                    key={s.name}
                    className="pl-1.5"
                    onClick={() => {
                      setName(s.name)
                      if (!amountText) setAmountText(paiseToInput(s.amount))
                      if (!categoryTouched) setCategoryId(s.categoryId)
                      if (!methodTouched && s.paymentMethodId) setPaymentMethodId(s.paymentMethodId)
                    }}
                  >
                    <CategoryIcon icon={cat?.icon} color={cat?.color} className="size-6 [&_svg]:size-3.5" />
                    {s.name}
                    <span className="money text-muted-foreground">{formatINR(s.amount)}</span>
                  </Chip>
                )
              })}
            </div>
          ) : null}
        </div>

        {/* Category */}
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

        {/* Who */}
        <div className="space-y-3">
          <p className="text-sm font-medium" id="exp-mode-label">
            Who was it for?
          </p>
          <Segmented label="Who was it for?" value={mode} onChange={changeMode} options={MODE_OPTIONS} />
          {!editId && groupChoices.length ? (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">Or add it to a shared group. Everyone sees it and gets their share:</p>
              <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
                {groupChoices.map((g) => (
                  <Chip key={g.id} onClick={() => shareInGroup(g.id)}>
                    <Users className="size-4" aria-hidden />
                    {g.name}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
          {mode !== 'solo' ? (
            <div className="space-y-3 rounded-2xl border bg-card p-3">
              <PeoplePicker
                label={mode === 'paidBy' ? 'Who paid?' : mode === 'for' ? 'Paid on behalf of' : 'Split with'}
                single={mode === 'paidBy'}
                selected={personIds}
                onChange={(ids) => {
                  setPersonIds(ids)
                  if (errors.people) setErrors((x) => ({ ...x, people: undefined }))
                }}
                error={errors.people}
              />
              {(mode === 'split' || mode === 'paidBy') && personIds.length > 0 ? (
                <div className="space-y-1.5">
                  <Label htmlFor="exp-myshare">Your share</Label>
                  <Input
                    id="exp-myshare"
                    inputMode="decimal"
                    value={myShareText}
                    placeholder={total > 0 ? paiseToInput(split.my) : 'Auto'}
                    onChange={(e) => setMyShareText(e.target.value.replace(/[^\d.]/g, ''))}
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground">
                    {mode === 'split' ? 'Leave empty to split equally.' : 'Leave empty if the whole bill was yours.'}
                  </p>
                </div>
              ) : null}
              {split.shares.length ? (
                <ul className="space-y-1 text-sm">
                  {split.shares.map((s) => (
                    <li key={s.personId} className="flex justify-between">
                      <span className="text-muted-foreground">{peopleMap.get(s.personId)?.name ?? 'Person'} owes you</span>
                      <span className="money font-medium">{formatINR(s.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {mode === 'paidBy' && personIds.length && total > 0 ? (
                <p className="text-sm text-muted-foreground">
                  You'll owe {peopleMap.get(personIds[0])?.name ?? 'them'}{' '}
                  <span className="money font-medium text-foreground">{formatINR(split.my)}</span>
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Payment method */}
        {mode !== 'paidBy' ? (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Paid with</legend>
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
              {methods.map((m) => (
                <Chip
                  key={m.id}
                  selected={m.id === paymentMethodId}
                  onClick={() => {
                    setPaymentMethodId(m.id)
                    setMethodTouched(true)
                  }}
                >
                  {m.label}
                </Chip>
              ))}
            </div>
          </fieldset>
        ) : null}

        {/* When */}
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">When</legend>
          <div className="flex flex-wrap items-center gap-2">
            <Chip selected={isToday} onClick={() => setOccurredAt(Date.now())}>
              Today
            </Chip>
            <Chip selected={isYesterday} onClick={() => setOccurredAt(Date.now() - 86_400_000)}>
              Yesterday
            </Chip>
            <Input
              type="datetime-local"
              aria-label="Date and time"
              value={toDateTimeLocal(occurredAt)}
              max={toDateTimeLocal(now + 86_400_000 * 366)}
              onChange={(e) => e.target.value && setOccurredAt(fromDateTimeLocal(e.target.value))}
              className="h-11 w-auto min-w-0 flex-1 rounded-full"
            />
          </div>
        </fieldset>

        {/* More */}
        <div>
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
            className="flex min-h-11 items-center gap-1 text-sm font-medium text-brand"
          >
            More options
            <ChevronDown className={cn('size-4 transition-transform', showMore && 'rotate-180')} aria-hidden />
          </button>
          {showMore ? (
            <div className="mt-2 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="exp-note">Note</Label>
                <Textarea id="exp-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional" />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="exp-count" className="flex-col items-start gap-0.5">
                  <span>Count in monthly spend</span>
                  <span className="text-xs font-normal text-muted-foreground">Turn off for deals or money that isn't really spending</span>
                </Label>
                <Switch id="exp-count" checked={!excludeFromSpend} onCheckedChange={(v) => setExcludeFromSpend(!v)} />
              </div>
              {!editId ? (
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor="exp-repeat" className="flex-col items-start gap-0.5">
                    <span>Repeat every month</span>
                    <span className="text-xs font-normal text-muted-foreground">Reminds you on Home each month, e.g. rent or wifi</span>
                  </Label>
                  <Switch id="exp-repeat" checked={repeatMonthly} onCheckedChange={setRepeatMonthly} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <DrawerFooter className="pb-safe-4 flex-row gap-2 border-t bg-background pt-3">
        {editId ? (
          <Button type="button" variant="ghost" className="h-12 text-negative hover:text-negative" onClick={() => void handleDelete()}>
            <Trash2 aria-hidden />
            Delete
          </Button>
        ) : null}
        <Button type="submit" className="h-12 flex-1 text-base" disabled={saving || (Boolean(editId) && !loaded)}>
          {editId ? 'Save changes' : 'Save expense'}
        </Button>
      </DrawerFooter>
    </form>
  )
}
