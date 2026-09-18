import { create } from 'zustand'
import type { LedgerType } from '@/lib/types'

export type SplitMode = 'solo' | 'split' | 'for' | 'paidBy'

export interface ExpensePreset {
  name?: string
  amount?: number
  categoryId?: string
  personId?: string
  mode?: SplitMode
}

export interface GroupExpensePreset {
  title?: string
  amount?: number
  categoryId?: string
  occurredAt?: number
}

interface LedgerSheetState {
  open: boolean
  session: number
  editId: string | null
  personId: string | null
  type: LedgerType | null
  amount: number | null
}

interface SettleSheetState {
  open: boolean
  session: number
  groupId: string | null
  from: string | null
  to: string | null
  amount: number | null
  expenseId: string | null
}

interface UiState {
  /** null = follow the current month */
  monthKey: string | null
  setMonthKey: (key: string | null) => void

  /** `session` changes on every open so forms reset, while content stays mounted for the close animation. */
  expenseSheet: { open: boolean; session: number; editId: string | null; preset: ExpensePreset | null }
  openExpense: (opts?: { editId?: string; preset?: ExpensePreset }) => void
  closeExpense: () => void

  ledgerSheet: LedgerSheetState
  openLedger: (opts?: { editId?: string; personId?: string; type?: LedgerType; amount?: number }) => void
  closeLedger: () => void

  groupExpenseSheet: { open: boolean; session: number; groupId: string | null; editId: string | null; preset: GroupExpensePreset | null }
  openGroupExpense: (opts?: { groupId?: string; editId?: string; preset?: GroupExpensePreset }) => void
  closeGroupExpense: () => void

  groupDetail: { open: boolean; session: number; expenseId: string | null }
  openGroupDetail: (expenseId: string) => void
  closeGroupDetail: () => void

  settleSheet: SettleSheetState
  openSettle: (opts: { groupId: string; from?: string; to?: string; amount?: number; expenseId?: string }) => void
  closeSettle: () => void
}

export const useUi = create<UiState>((set) => ({
  monthKey: null,
  setMonthKey: (monthKey) => set({ monthKey }),

  expenseSheet: { open: false, session: 0, editId: null, preset: null },
  openExpense: (opts) =>
    set((s) => ({
      expenseSheet: { open: true, session: s.expenseSheet.session + 1, editId: opts?.editId ?? null, preset: opts?.preset ?? null },
    })),
  closeExpense: () => set((s) => ({ expenseSheet: { ...s.expenseSheet, open: false } })),

  ledgerSheet: { open: false, session: 0, editId: null, personId: null, type: null, amount: null },
  openLedger: (opts) =>
    set((s) => ({
      ledgerSheet: {
        open: true,
        session: s.ledgerSheet.session + 1,
        editId: opts?.editId ?? null,
        personId: opts?.personId ?? null,
        type: opts?.type ?? null,
        amount: opts?.amount ?? null,
      },
    })),
  closeLedger: () => set((s) => ({ ledgerSheet: { ...s.ledgerSheet, open: false } })),

  groupExpenseSheet: { open: false, session: 0, groupId: null, editId: null, preset: null },
  openGroupExpense: (opts) =>
    set((s) => ({
      groupExpenseSheet: {
        open: true,
        session: s.groupExpenseSheet.session + 1,
        groupId: opts?.groupId ?? null,
        editId: opts?.editId ?? null,
        preset: opts?.preset ?? null,
      },
    })),
  closeGroupExpense: () => set((s) => ({ groupExpenseSheet: { ...s.groupExpenseSheet, open: false } })),

  groupDetail: { open: false, session: 0, expenseId: null },
  openGroupDetail: (expenseId) => set((s) => ({ groupDetail: { open: true, session: s.groupDetail.session + 1, expenseId } })),
  closeGroupDetail: () => set((s) => ({ groupDetail: { ...s.groupDetail, open: false } })),

  settleSheet: { open: false, session: 0, groupId: null, from: null, to: null, amount: null, expenseId: null },
  openSettle: (opts) =>
    set((s) => ({
      settleSheet: {
        open: true,
        session: s.settleSheet.session + 1,
        groupId: opts.groupId,
        from: opts.from ?? null,
        to: opts.to ?? null,
        amount: opts.amount ?? null,
        expenseId: opts.expenseId ?? null,
      },
    })),
  closeSettle: () => set((s) => ({ settleSheet: { ...s.settleSheet, open: false } })),
}))
