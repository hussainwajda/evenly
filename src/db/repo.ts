import { ledgerEntriesForTransaction } from '@/lib/ledger'
import type {
  Budget,
  Category,
  LedgerEntry,
  LedgerType,
  PaymentMethod,
  Person,
  Recurring,
  Settings,
  Share,
  Transaction,
  TxnSource,
} from '@/lib/types'
import { daysInMonth, parseMonthKey } from '@/lib/dates'
import { uid } from '@/lib/utils'
import { db, defaultSettings } from './index'

export const lowerName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase()

/* ───────────────────────── Settings ───────────────────────── */

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('app')) ?? defaultSettings()
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, id: 'app' })
}

/* ───────────────────────── Expenses ───────────────────────── */

export interface ExpenseInput {
  name: string
  /** my share, paise */
  amount: number
  /** full bill, paise */
  grossAmount?: number
  categoryId: string
  paymentMethodId: string | null
  occurredAt: number
  note?: string
  tags?: string[]
  source?: TxnSource
  excludeFromSpend?: boolean
  paidByPersonId?: string | null
  shares?: Share[]
  recurringId?: string | null
  importBatchId?: string | null
}

export async function saveExpense(input: ExpenseInput, id?: string): Promise<string> {
  const now = Date.now()
  return db.transaction('rw', db.transactions, db.ledger, async () => {
    const existing = id ? await db.transactions.get(id) : undefined
    const txnId = existing?.id ?? id ?? uid()
    const paidByPersonId = input.paidByPersonId ?? null
    const shares = paidByPersonId ? [] : (input.shares ?? []).filter((s) => s.amount > 0)
    const txn: Transaction = {
      id: txnId,
      name: input.name.trim().replace(/\s+/g, ' '),
      nameLower: lowerName(input.name),
      amount: input.amount,
      grossAmount: input.grossAmount ?? input.amount + shares.reduce((a, s) => a + s.amount, 0),
      categoryId: input.categoryId,
      paymentMethodId: paidByPersonId ? null : input.paymentMethodId,
      occurredAt: input.occurredAt,
      note: input.note?.trim() ?? '',
      tags: input.tags ?? [],
      source: input.source ?? existing?.source ?? 'manual',
      excludeFromSpend: input.excludeFromSpend ?? false,
      paidByPersonId,
      shares,
      recurringId: input.recurringId ?? existing?.recurringId ?? null,
      importBatchId: input.importBatchId ?? existing?.importBatchId ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    }
    await db.transactions.put(txn)
    await db.ledger.where('transactionId').equals(txnId).delete()
    const derived = ledgerEntriesForTransaction(txn)
    if (derived.length) {
      await db.ledger.bulkAdd(
        derived.map((d) => ({
          ...d,
          id: uid(),
          transactionId: txnId,
          importBatchId: txn.importBatchId,
          createdAt: now,
          deletedAt: null,
        })),
      )
    }
    return txnId
  })
}

export async function deleteExpense(id: string): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', db.transactions, db.ledger, async () => {
    await db.transactions.update(id, { deletedAt: now })
    await db.ledger.where('transactionId').equals(id).modify({ deletedAt: now })
  })
}

export async function restoreExpense(id: string): Promise<void> {
  await db.transaction('rw', db.transactions, db.ledger, async () => {
    await db.transactions.update(id, { deletedAt: null })
    await db.ledger.where('transactionId').equals(id).modify({ deletedAt: null })
  })
}

export async function transactionsBetween(start: number, end: number): Promise<Transaction[]> {
  const rows = await db.transactions.where('occurredAt').between(start, end, true, false).toArray()
  return rows.filter((t) => !t.deletedAt)
}

export interface NameSuggestion {
  name: string
  categoryId: string
  amount: number
  paymentMethodId: string | null
  count: number
}

/** Autocomplete from history: most-used names first, carrying the latest category / amount / method. */
export async function nameSuggestions(query: string, limit = 6): Promise<NameSuggestion[]> {
  const q = lowerName(query)
  if (!q) return []
  const rows = await db.transactions.where('nameLower').startsWith(q).limit(500).toArray()
  const map = new Map<string, NameSuggestion & { latest: number }>()
  for (const t of rows) {
    if (t.deletedAt) continue
    const cur = map.get(t.nameLower)
    if (!cur) {
      map.set(t.nameLower, { name: t.name, categoryId: t.categoryId, amount: t.amount, paymentMethodId: t.paymentMethodId, count: 1, latest: t.occurredAt })
      continue
    }
    cur.count++
    if (t.occurredAt > cur.latest) {
      Object.assign(cur, { name: t.name, categoryId: t.categoryId, amount: t.amount, paymentMethodId: t.paymentMethodId, latest: t.occurredAt })
    }
  }
  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.latest - a.latest)
    .slice(0, limit)
    .map(({ latest: _latest, ...s }) => s)
}

/** Category learned from the user's own history for this exact name (beats keyword rules). */
export async function learnedCategory(name: string): Promise<string | null> {
  const q = lowerName(name)
  if (!q) return null
  const rows = await db.transactions.where('nameLower').equals(q).toArray()
  const counts = new Map<string, number>()
  for (const t of rows) if (!t.deletedAt) counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1)
  let best: string | null = null
  let bestCount = 0
  for (const [id, c] of counts) if (c > bestCount) [best, bestCount] = [id, c]
  return best
}

/* ───────────────────────── People & ledger ───────────────────────── */

export async function savePerson(input: { name: string; phone?: string; note?: string }, id?: string): Promise<string> {
  const existing = id ? await db.people.get(id) : undefined
  const person: Person = {
    id: existing?.id ?? uid(),
    name: input.name.trim().replace(/\s+/g, ' '),
    nameLower: lowerName(input.name),
    phone: input.phone?.trim() ?? existing?.phone ?? '',
    note: input.note?.trim() ?? existing?.note ?? '',
    archived: existing?.archived ?? false,
    createdAt: existing?.createdAt ?? Date.now(),
  }
  await db.people.put(person)
  return person.id
}

export async function getOrCreatePerson(name: string): Promise<string> {
  const found = await db.people.where('nameLower').equals(lowerName(name)).first()
  if (found) {
    if (found.archived) await db.people.update(found.id, { archived: false })
    return found.id
  }
  return savePerson({ name })
}

export async function setPersonArchived(id: string, archived: boolean): Promise<void> {
  await db.people.update(id, { archived })
}

export interface LedgerInput {
  personId: string
  type: LedgerType
  amount: number
  occurredAt: number
  note?: string
  paymentMethodId?: string | null
  importBatchId?: string | null
}

export async function saveLedgerEntry(input: LedgerInput, id?: string): Promise<string> {
  const existing = id ? await db.ledger.get(id) : undefined
  const entry: LedgerEntry = {
    id: existing?.id ?? uid(),
    personId: input.personId,
    type: input.type,
    amount: input.amount,
    occurredAt: input.occurredAt,
    note: input.note?.trim() ?? '',
    paymentMethodId: input.paymentMethodId ?? null,
    transactionId: existing?.transactionId ?? null,
    importBatchId: input.importBatchId ?? existing?.importBatchId ?? null,
    createdAt: existing?.createdAt ?? Date.now(),
    deletedAt: null,
  }
  await db.ledger.put(entry)
  return entry.id
}

export async function deleteLedgerEntry(id: string): Promise<void> {
  await db.ledger.update(id, { deletedAt: Date.now() })
}

export async function restoreLedgerEntry(id: string): Promise<void> {
  await db.ledger.update(id, { deletedAt: null })
}

/* ───────────────────────── Budgets ───────────────────────── */

export async function setBudget(monthKey: string, total: number, perCategory: Record<string, number> = {}): Promise<void> {
  const clean = Object.fromEntries(Object.entries(perCategory).filter(([, v]) => v > 0))
  await db.budgets.put({ monthKey, total, perCategory: clean, updatedAt: Date.now() })
}

export interface EffectiveBudget extends Budget {
  /** true when carried forward from an earlier month */
  inherited: boolean
}

export async function getEffectiveBudget(monthKey: string): Promise<EffectiveBudget | null> {
  const exact = await db.budgets.get(monthKey)
  if (exact) return { ...exact, inherited: false }
  const earlier = await db.budgets.where('monthKey').below(monthKey).last()
  return earlier ? { ...earlier, inherited: true } : null
}

/* ───────────────────────── Categories & payment methods ───────────────────────── */

export async function saveCategory(input: Pick<Category, 'name' | 'icon' | 'color'> & { keywords?: string[] }, id?: string): Promise<string> {
  const existing = id ? await db.categories.get(id) : undefined
  const order = existing?.order ?? (await db.categories.count())
  const cat: Category = {
    id: existing?.id ?? uid(),
    name: input.name.trim(),
    icon: input.icon,
    color: input.color,
    keywords: input.keywords ?? existing?.keywords ?? [],
    order,
    archived: existing?.archived ?? false,
    builtIn: existing?.builtIn ?? false,
  }
  await db.categories.put(cat)
  return cat.id
}

export async function setCategoryArchived(id: string, archived: boolean): Promise<void> {
  await db.categories.update(id, { archived })
}

export async function savePaymentMethod(input: Pick<PaymentMethod, 'label' | 'type'>, id?: string): Promise<string> {
  const existing = id ? await db.paymentMethods.get(id) : undefined
  const pm: PaymentMethod = {
    id: existing?.id ?? uid(),
    label: input.label.trim(),
    type: input.type,
    order: existing?.order ?? (await db.paymentMethods.count()),
    archived: existing?.archived ?? false,
  }
  await db.paymentMethods.put(pm)
  return pm.id
}

export async function setPaymentMethodArchived(id: string, archived: boolean): Promise<void> {
  await db.paymentMethods.update(id, { archived })
}

/* ───────────────────────── Recurring ───────────────────────── */

export async function saveRecurring(input: Omit<Recurring, 'id' | 'createdAt' | 'lastAddedMonthKey'>, id?: string): Promise<string> {
  const existing = id ? await db.recurring.get(id) : undefined
  const rec: Recurring = {
    ...input,
    id: existing?.id ?? uid(),
    lastAddedMonthKey: existing?.lastAddedMonthKey ?? null,
    createdAt: existing?.createdAt ?? Date.now(),
  }
  await db.recurring.put(rec)
  return rec.id
}

export async function deleteRecurring(id: string): Promise<void> {
  await db.recurring.delete(id)
}

/** Calendar date a recurring item falls on inside a month key (day clamped to month length). */
export function recurringDueDate(rec: Pick<Recurring, 'dayOfMonth'>, monthKey: string): number {
  const { year, monthIndex } = parseMonthKey(monthKey)
  const day = Math.min(rec.dayOfMonth, daysInMonth(year, monthIndex))
  return new Date(year, monthIndex, day, 9, 0).getTime()
}

export function dueRecurring(items: Recurring[], monthKey: string, now: number): Recurring[] {
  return items.filter((r) => r.active && r.lastAddedMonthKey !== monthKey && now >= recurringDueDate(r, monthKey) - 86_400_000 * 2)
}

export async function addRecurringForMonth(rec: Recurring, monthKey: string, defaultPaymentMethodId: string): Promise<string> {
  const id = await saveExpense({
    name: rec.name,
    amount: rec.amount,
    categoryId: rec.categoryId,
    paymentMethodId: rec.paymentMethodId ?? defaultPaymentMethodId,
    occurredAt: Math.min(recurringDueDate(rec, monthKey), Date.now()),
    source: 'recurring',
    recurringId: rec.id,
  })
  await db.recurring.update(rec.id, { lastAddedMonthKey: monthKey })
  return id
}

export async function skipRecurringForMonth(rec: Recurring, monthKey: string): Promise<void> {
  await db.recurring.update(rec.id, { lastAddedMonthKey: monthKey })
}
