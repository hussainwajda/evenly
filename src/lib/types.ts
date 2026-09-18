/** Domain model. All money fields are integer paise; all timestamps are epoch ms. */

export type ThemePref = 'dark' | 'light' | 'system'

export interface Settings {
  id: 'app'
  monthStartDay: number
  defaultPaymentMethodId: string
  theme: ThemePref
  lastBackupAt: number | null
  createdAt: number
}

export interface Category {
  id: string
  name: string
  icon: string
  color: string
  keywords: string[]
  order: number
  archived: boolean
  builtIn: boolean
}

export type PaymentMethodType = 'upi' | 'cash' | 'card' | 'netbanking' | 'wallet' | 'other'

export interface PaymentMethod {
  id: string
  label: string
  type: PaymentMethodType
  order: number
  archived: boolean
}

export interface Budget {
  monthKey: string
  total: number
  perCategory: Record<string, number>
  updatedAt: number
}

export type TxnSource = 'manual' | 'quick' | 'import' | 'recurring' | 'group'

export interface Share {
  personId: string
  amount: number
}

export interface Transaction {
  id: string
  name: string
  nameLower: string
  /** My share — what counts toward my spend. */
  amount: number
  /** Full bill amount. Equals `amount` unless split. */
  grossAmount: number
  categoryId: string
  /** null when someone else paid (paidByPersonId set). */
  paymentMethodId: string | null
  occurredAt: number
  note: string
  tags: string[]
  source: TxnSource
  /** e.g. "deal" money that should not count in monthly spend. */
  excludeFromSpend: boolean
  /** Someone else paid this bill for me → I owe them `amount`. */
  paidByPersonId: string | null
  /** Other people's shares of a bill I paid → they owe me. */
  shares: Share[]
  recurringId: string | null
  importBatchId: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  /**
   * Set on my share of a shared group expense. These rows are derived on each device from the group data
   * and never uploaded as personal data.
   */
  groupId?: string | null
  groupExpenseId?: string | null
  /** Full group bill, and who paid it ("you", "Rahul"), for display. */
  groupBill?: number | null
  groupPaidBy?: string | null
}

export interface Person {
  id: string
  name: string
  nameLower: string
  phone: string
  note: string
  archived: boolean
  createdAt: number
}

/**
 * lent     — I gave money / paid for them        → they owe me more
 * borrowed — they gave me money / paid for me     → I owe them more
 * received — they paid me back                    → they owe me less
 * repaid   — I paid them back                     → I owe them less
 */
export type LedgerType = 'lent' | 'borrowed' | 'received' | 'repaid'

export interface LedgerEntry {
  id: string
  personId: string
  type: LedgerType
  amount: number
  occurredAt: number
  note: string
  paymentMethodId: string | null
  /** Set when generated from a split / paid-by expense. */
  transactionId: string | null
  importBatchId: string | null
  createdAt: number
  deletedAt: number | null
}

export interface Recurring {
  id: string
  name: string
  amount: number
  categoryId: string
  paymentMethodId: string | null
  /** 1–31, clamped to month length. */
  dayOfMonth: number
  active: boolean
  lastAddedMonthKey: string | null
  createdAt: number
}

export interface ImportBatch {
  id: string
  fileName: string
  createdAt: number
  transactionCount: number
  ledgerCount: number
}
