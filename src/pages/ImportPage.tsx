import { CircleCheck, FileSpreadsheet, Loader2, ShieldCheck, TriangleAlert, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Chip, PageHeader, Panel, Section } from '@/components/common'
import { NativeSelect } from '@/components/FormParts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { db } from '@/db'
import { commitImport, type ImportRow, removeImportBatch, type ReviewAction } from '@/db/importCommit'
import { useCategories } from '@/hooks/useData'
import { FALLBACK_CATEGORY_ID, suggestCategory } from '@/lib/categorize'
import { formatMonthKey, monthRange } from '@/lib/dates'
import { type Cell, inferSheetMonths, type ParsedItem, type ParsedSheet, parseSheetRows } from '@/lib/excelSheet'
import { formatINR } from '@/lib/money'
import { parseQuickAdd, tidyName } from '@/lib/quickAdd'
import type { Category } from '@/lib/types'
import { cn } from '@/lib/utils'

interface SheetState {
  name: string
  monthKey: string
  include: boolean
  parsed: ParsedSheet
  existingCount: number
}

interface Decision {
  action: ReviewAction
  personName: string
  categoryId: string
  text: string
}

const ACTIONS: { value: ReviewAction; label: string }[] = [
  { value: 'skip', label: 'Skip' },
  { value: 'expense', label: 'Expense' },
  { value: 'exclude', label: 'Expense, not counted (deal)' },
  { value: 'lent', label: 'I lent to…' },
  { value: 'borrowed', label: 'I borrowed from / owe…' },
  { value: 'received', label: 'Got back from…' },
  { value: 'repaid', label: 'Paid back to…' },
]
const PERSON_ACTIONS = new Set<ReviewAction>(['lent', 'borrowed', 'received', 'repaid'])
const GENERIC_SECTION = /^(to pay|to take|to give|take|give|after total|deals?|deal expense|received|account balance.*)$/i

function defaultDecision(it: ParsedItem, cats: Category[]): Decision {
  const categoryId = suggestCategory(it.name, cats.length ? cats : undefined) ?? FALLBACK_CATEGORY_ID
  const section = it.section ?? ''
  let action: ReviewAction = 'skip'
  if (it.kind === 'expense') action = 'expense'
  else if (it.amount > 0) {
    if (/deal/i.test(section)) action = 'exclude'
    else if (/^to pay$|^give$/i.test(section)) action = 'borrowed'
    else if (/^take$/i.test(section)) action = 'lent'
  }
  const personName = section && !GENERIC_SECTION.test(section) ? section.replace(/\s+(cr|dr)$/i, '') : it.name
  return { action, personName: tidyName(personName), categoryId, text: it.raw }
}

export function ImportPage() {
  const categories = useCategories()
  const activeCategories = categories.filter((c) => !c.archived)
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<'pick' | 'review' | 'done'>('pick')
  const [fileName, setFileName] = useState('')
  const [sheets, setSheets] = useState<SheetState[]>([])
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showExpenses, setShowExpenses] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ batchId: string; transactions: number; ledger: number } | null>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const months = inferSheetMonths(wb.SheetNames)
      const next: SheetState[] = []
      const dec: Record<string, Decision> = {}
      for (const [i, name] of wb.SheetNames.entries()) {
        const rows = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], { header: 1, raw: true, defval: null })
        const parsed = parseSheetRows(name, rows)
        const monthKey = months[i] ?? ''
        let existingCount = 0
        if (monthKey) {
          const r = monthRange(monthKey)
          existingCount = await db.transactions
            .where('occurredAt')
            .between(r.start, r.end, true, false)
            .filter((t) => !t.deletedAt)
            .count()
        }
        next.push({ name, monthKey, include: Boolean(monthKey) && parsed.items.some((x) => x.kind === 'expense'), parsed, existingCount })
        for (const it of parsed.items) dec[it.key] = defaultDecision(it, activeCategories)
      }
      if (!next.some((s) => s.parsed.items.length)) throw new Error('empty')
      setFileName(file.name)
      setSheets(next)
      setDecisions(dec)
      setStep('review')
    } catch {
      setError("Couldn't find expenses in this file. Choose the .xlsx sheet with “day 1 … day 31” columns.")
    } finally {
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const rows = useMemo(() => {
    const out: ImportRow[] = []
    for (const s of sheets) {
      if (!s.include || !s.monthKey) continue
      for (const it of s.parsed.items) {
        const d = decisions[it.key]
        if (!d || d.action === 'skip') continue
        let name = it.name
        let amount = it.amount
        if (d.text !== it.raw || it.kind === 'unparsed') {
          const p = parseQuickAdd(d.text)
          if (!p) continue
          name = p.name
          amount = p.amount
        }
        if (amount <= 0) continue
        out.push({ monthKey: s.monthKey, day: it.day, name: tidyName(name), amount, categoryId: d.categoryId, action: d.action, personName: d.personName })
      }
    }
    return out
  }, [sheets, decisions])

  const summary = useMemo(() => {
    const expenses = rows.filter((r) => r.action === 'expense' || r.action === 'exclude')
    const includedSheets = sheets.filter((s) => s.include)
    return {
      expenses: expenses.length,
      entries: rows.length - expenses.length,
      total: rows.filter((r) => r.action === 'expense').reduce((a, r) => a + r.amount, 0),
      sheets: includedSheets.length,
      toReview: includedSheets.reduce((a, s) => a + s.parsed.items.filter((i) => i.kind !== 'expense').length, 0),
    }
  }, [rows, sheets])

  const setDecision = (key: string, patch: Partial<Decision>) => setDecisions((d) => ({ ...d, [key]: { ...d[key], ...patch } }))
  const setSheet = (name: string, patch: Partial<SheetState>) => setSheets((all) => all.map((s) => (s.name === name ? { ...s, ...patch } : s)))

  async function commit() {
    setCommitting(true)
    try {
      const r = await commitImport(fileName, rows)
      setResult(r)
      setStep('done')
    } catch (e) {
      console.error(e)
      toast.error('Import failed. Nothing was changed.')
    } finally {
      setCommitting(false)
    }
  }

  if (step === 'pick') {
    return (
      <>
        <PageHeader title="Import from Excel" backTo="/more" />
        <div className="space-y-6 px-4 pt-2 lg:max-w-3xl">
          <Panel className="space-y-4">
            <span className="grid size-12 place-items-center rounded-2xl bg-brand/15 text-brand">
              <FileSpreadsheet className="size-6" aria-hidden />
            </span>
            <div className="space-y-2">
              <p className="text-lg font-semibold">Bring in your monthly expenses sheet</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                <li>Each sheet becomes a month. You can fix the month and year.</li>
                <li>Cells like “chai - 12” become expenses on that day, auto-categorised.</li>
                <li>Side notes (to pay, take/give, deals, cr/dr) come to you for review.</li>
              </ul>
            </div>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0" aria-hidden /> The file is read on your phone and never uploaded.
            </p>
            <Button className="h-12 w-full text-base" onClick={() => fileRef.current?.click()} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
              {loading ? 'Reading…' : 'Choose .xlsx file'}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            {error ? (
              <p className="flex items-start gap-2 text-sm text-negative" role="alert">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
              </p>
            ) : null}
          </Panel>
        </div>
      </>
    )
  }

  if (step === 'done' && result) {
    return (
      <>
        <PageHeader title="Import complete" backTo="/more" />
        <div className="space-y-4 px-4 pt-2 lg:max-w-3xl">
          <Panel className="space-y-4 text-center">
            <CircleCheck className="mx-auto size-12 text-positive" aria-hidden />
            <div>
              <p className="text-lg font-semibold">Imported {result.transactions} expenses</p>
              <p className="text-sm text-muted-foreground">
                and {result.ledger} borrow/lend {result.ledger === 1 ? 'entry' : 'entries'} from {fileName}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">Use the month arrows on Home to browse older months.</p>
            <div className="grid gap-2">
              <Button asChild className="h-12">
                <Link to="/">Go to Home</Link>
              </Button>
              <Button
                variant="ghost"
                className="h-11"
                onClick={async () => {
                  await removeImportBatch(result.batchId)
                  toast('Import undone')
                  setResult(null)
                  setStep('pick')
                }}
              >
                Undo import
              </Button>
            </div>
          </Panel>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Review import" subtitle={fileName} backTo="/more" />
      <div className="space-y-5 px-4 pt-2 pb-24 lg:max-w-3xl">
        <Panel className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xl font-semibold">{summary.expenses}</p>
            <p className="text-xs text-muted-foreground">expenses</p>
          </div>
          <div>
            <p className="text-xl font-semibold">{summary.entries}</p>
            <p className="text-xs text-muted-foreground">people entries</p>
          </div>
          <div>
            <p className="truncate text-xl font-semibold">{formatINR(summary.total, { compact: true })}</p>
            <p className="text-xs text-muted-foreground">in {summary.sheets} months</p>
          </div>
        </Panel>

        <Section title="Months">
          <div className="space-y-3">
            {sheets.map((s) => {
              const review = s.parsed.items.filter((i) => i.kind !== 'expense')
              const expenseItems = s.parsed.items.filter((i) => i.kind === 'expense')
              const isOpen = expanded === s.name
              const totalsMatch = s.parsed.declaredTotal != null && s.parsed.declaredTotal === s.parsed.parsedTotal
              return (
                <div key={s.name} className={cn('rounded-2xl border bg-card', !s.include && 'opacity-70')}>
                  <div className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-medium">
                        {s.name}
                        {s.monthKey ? <span className="font-normal text-muted-foreground"> → {formatMonthKey(s.monthKey, true)}</span> : null}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {expenseItems.length} expenses · {formatINR(s.parsed.parsedTotal)}
                        {s.parsed.declaredTotal != null ? (totalsMatch ? ' · matches sheet total' : ` · sheet says ${formatINR(s.parsed.declaredTotal)}`) : ''}
                      </p>
                      {review.length ? <p className="text-sm text-warning">{review.length} to review</p> : null}
                      {s.existingCount && s.include ? (
                        <p className="flex items-center gap-1 text-sm text-warning">
                          <TriangleAlert className="size-3.5" aria-hidden /> Month already has {s.existingCount} expenses
                        </p>
                      ) : null}
                    </div>
                    <Switch checked={s.include} disabled={!s.monthKey} onCheckedChange={(v) => setSheet(s.name, { include: v })} aria-label={`Import ${s.name}`} />
                  </div>
                  {s.parsed.items.length ? (
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : s.name)}
                      aria-expanded={isOpen}
                      className="flex min-h-11 w-full items-center justify-center border-t text-sm font-medium text-brand"
                    >
                      {isOpen ? 'Hide details' : 'Month, review & categories'}
                    </button>
                  ) : null}
                  {isOpen ? (
                    <div className="space-y-4 border-t p-4">
                      <div className="flex items-center gap-3">
                        <label htmlFor={`m-${s.name}`} className="text-sm font-medium">
                          Month
                        </label>
                        <Input
                          id={`m-${s.name}`}
                          type="month"
                          value={s.monthKey}
                          onChange={(e) => setSheet(s.name, { monthKey: e.target.value, include: Boolean(e.target.value) && s.include })}
                          className="h-11 flex-1"
                        />
                      </div>

                      {review.length ? (
                        <div className="space-y-2">
                          <p className="text-sm font-medium">Needs review</p>
                          {review.map((it) => {
                            const d = decisions[it.key]
                            return (
                              <div key={it.key} className="space-y-2 rounded-xl bg-muted/50 p-3">
                                <p className="text-sm">
                                  <span className="font-medium">{it.raw}</span>
                                  <span className="text-muted-foreground">
                                    {it.section ? ` · ${it.section}` : ''}
                                    {it.day ? ` · day ${it.day}` : ''}
                                  </span>
                                </p>
                                {it.kind === 'unparsed' ? (
                                  <Input
                                    value={d.text}
                                    onChange={(e) => {
                                      const text = e.target.value
                                      setDecision(it.key, { text, action: parseQuickAdd(text) && d.action === 'skip' ? 'expense' : d.action })
                                    }}
                                    aria-label={`Fix "${it.raw}", for example add an amount`}
                                    placeholder="Add an amount, e.g. cng 150"
                                    className="h-10"
                                  />
                                ) : null}
                                <div className="flex gap-2">
                                  <div className="flex-1">
                                    <NativeSelect value={d.action} onChange={(e) => setDecision(it.key, { action: e.target.value as ReviewAction })} aria-label="What is this?" className="h-10">
                                      {ACTIONS.map((a) => (
                                        <option key={a.value} value={a.value}>
                                          {a.label}
                                        </option>
                                      ))}
                                    </NativeSelect>
                                  </div>
                                  {PERSON_ACTIONS.has(d.action) ? (
                                    <Input value={d.personName} onChange={(e) => setDecision(it.key, { personName: e.target.value })} aria-label="Person" placeholder="Person" className="h-10 flex-1" />
                                  ) : null}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : null}

                      {expenseItems.length ? (
                        <div className="space-y-2">
                          <Chip selected={showExpenses === s.name} onClick={() => setShowExpenses(showExpenses === s.name ? null : s.name)}>
                            {showExpenses === s.name ? 'Hide' : 'Check'} {expenseItems.length} expenses & categories
                          </Chip>
                          {showExpenses === s.name ? (
                            <ul className="divide-y rounded-xl border">
                              {expenseItems.map((it) => {
                                const d = decisions[it.key]
                                return (
                                  <li key={it.key} className="flex items-center gap-2 px-3 py-2">
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-sm font-medium">{tidyName(it.name)}</p>
                                      <p className="text-xs text-muted-foreground">
                                        Day {it.day} · <span className="money">{formatINR(it.amount)}</span>
                                      </p>
                                    </div>
                                    <div className="w-40">
                                      <NativeSelect
                                        value={d.action === 'skip' ? '__skip' : d.categoryId}
                                        onChange={(e) =>
                                          e.target.value === '__skip'
                                            ? setDecision(it.key, { action: 'skip' })
                                            : setDecision(it.key, { action: 'expense', categoryId: e.target.value })
                                        }
                                        aria-label={`Category for ${it.name}`}
                                        className="h-10 text-xs"
                                      >
                                        {activeCategories.map((c) => (
                                          <option key={c.id} value={c.id}>
                                            {c.name}
                                          </option>
                                        ))}
                                        <option value="__skip">Skip</option>
                                      </NativeSelect>
                                    </div>
                                  </li>
                                )
                              })}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </Section>
      </div>

      <div className="fixed inset-x-0 z-30 border-t bg-glass backdrop-blur-xl lg:left-64" style={{ bottom: 'calc(var(--nav-height) + var(--safe-bottom))' }}>
        <div className="mx-auto flex max-w-lg gap-2 px-4 py-3">
          <Button variant="ghost" className="h-12" onClick={() => setStep('pick')}>
            Cancel
          </Button>
          <Button className="h-12 flex-1 text-base" disabled={committing || rows.length === 0} onClick={() => void commit()}>
            {committing ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Import {summary.expenses} expenses
            {summary.entries ? ` + ${summary.entries}` : ''}
          </Button>
        </div>
      </div>
    </>
  )
}
