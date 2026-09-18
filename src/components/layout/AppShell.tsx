import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { Outlet, ScrollRestoration, useSearchParams } from 'react-router'
import { ExpenseSheet } from '@/components/ExpenseSheet'
import { GroupExpenseDetail } from '@/components/groups/GroupExpenseDetail'
import { GroupExpenseSheet } from '@/components/groups/GroupExpenseSheet'
import { SettleUpSheet } from '@/components/groups/SettleUpSheet'
import { BottomNav } from '@/components/layout/BottomNav'
import { PwaPrompt } from '@/components/layout/PwaPrompt'
import { Sidebar } from '@/components/layout/Sidebar'
import { LedgerSheet } from '@/components/LedgerSheet'
import { AccountConflictDialog } from '@/components/SyncParts'
import { getSettings } from '@/db/repo'
import { applyTheme } from '@/lib/theme'
import { useUi } from '@/stores/ui'

export function AppShell() {
  // undefined until loaded — avoids overwriting the saved theme with the default on first render
  const settings = useLiveQuery(() => getSettings(), [])
  const openExpense = useUi((s) => s.openExpense)
  const [params, setParams] = useSearchParams()

  useEffect(() => {
    if (!settings) return
    applyTheme(settings.theme)
    if (settings.theme !== 'system') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [settings?.theme])

  // Home-screen shortcut: /?add=expense
  useEffect(() => {
    if (params.get('add') !== 'expense') return
    openExpense()
    const next = new URLSearchParams(params)
    next.delete('add')
    setParams(next, { replace: true })
  }, [params, setParams, openExpense])

  // Keyboard: press N anywhere (outside a text field) to add an expense.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) return
      const { expenseSheet, ledgerSheet } = useUi.getState()
      if (expenseSheet.open || ledgerSheet.open) return
      e.preventDefault()
      openExpense()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openExpense])

  // Ask the browser not to evict local data.
  useEffect(() => {
    void navigator.storage?.persisted?.().then((persisted) => {
      if (!persisted) void navigator.storage.persist?.()
    })
  }, [])

  return (
    <div className="min-h-dvh">
      <Sidebar />
      <div className="mx-auto max-w-lg lg:ml-64 lg:max-w-none">
        <main className="pb-nav">
          <div className="lg:mx-auto lg:max-w-6xl lg:px-4">
            <Outlet />
          </div>
        </main>
      </div>
      <BottomNav />
      <ExpenseSheet />
      <LedgerSheet />
      <GroupExpenseSheet />
      <GroupExpenseDetail />
      <SettleUpSheet />
      <PwaPrompt />
      <AccountConflictDialog />
      <ScrollRestoration />
    </div>
  )
}
