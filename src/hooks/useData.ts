import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db, defaultSettings } from '@/db'
import { getEffectiveBudget, getSettings, transactionsBetween } from '@/db/repo'
import { formatMonthKey, monthKeyOf, monthRange } from '@/lib/dates'
import { balancesByPerson } from '@/lib/ledger'
import type { Category, LedgerEntry, PaymentMethod, Person, Recurring } from '@/lib/types'
import { useUi } from '@/stores/ui'

const FALLBACK_SETTINGS = defaultSettings()
const NO_CATEGORIES: Category[] = []
const NO_METHODS: PaymentMethod[] = []
const NO_PEOPLE: Person[] = []
const NO_LEDGER: LedgerEntry[] = []
const NO_RECURRING: Recurring[] = []

export function useSettings() {
  return useLiveQuery(() => getSettings(), [], FALLBACK_SETTINGS)
}

export function useCategories() {
  return useLiveQuery(() => db.categories.orderBy('order').toArray(), [], NO_CATEGORIES)
}

export function useCategoryMap() {
  const cats = useCategories()
  return useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats])
}

export function usePaymentMethods() {
  return useLiveQuery(() => db.paymentMethods.orderBy('order').toArray(), [], NO_METHODS)
}

export function usePaymentMethodMap() {
  const pms = usePaymentMethods()
  return useMemo(() => new Map(pms.map((p) => [p.id, p])), [pms])
}

export function usePeople() {
  return useLiveQuery(() => db.people.orderBy('nameLower').toArray(), [], NO_PEOPLE)
}

export function usePeopleMap() {
  const people = usePeople()
  return useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
}

export function useLedger() {
  return useLiveQuery(() => db.ledger.toArray(), [], NO_LEDGER)
}

export function useBalances() {
  const ledger = useLedger()
  return useMemo(() => balancesByPerson(ledger), [ledger])
}

export function useRecurring() {
  return useLiveQuery(() => db.recurring.toArray(), [], NO_RECURRING)
}

/** Ticks every minute so "today" rolls over while the app stays open. */
export function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    const onVisible = () => document.visibilityState === 'visible' && setNow(Date.now())
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs])
  return now
}

export function useSelectedMonth() {
  const settings = useSettings()
  const now = useNow()
  const selected = useUi((s) => s.monthKey)
  const startDay = settings.monthStartDay
  const currentMonthKey = monthKeyOf(now, startDay)
  const monthKey = selected ?? currentMonthKey
  const range = useMemo(() => monthRange(monthKey, startDay), [monthKey, startDay])
  return {
    monthKey,
    currentMonthKey,
    isCurrent: monthKey === currentMonthKey,
    range,
    label: formatMonthKey(monthKey, true),
    startDay,
    now,
  }
}

/** undefined while loading */
export function useTransactions(range: { start: number; end: number }) {
  return useLiveQuery(() => transactionsBetween(range.start, range.end), [range.start, range.end])
}

/** undefined while loading, null when no budget has ever been set */
export function useBudget(monthKey: string) {
  return useLiveQuery(() => getEffectiveBudget(monthKey), [monthKey])
}
