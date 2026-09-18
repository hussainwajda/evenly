import Dexie, { type EntityTable, type Table } from 'dexie'
import { DEFAULT_CATEGORIES } from '@/lib/categorize'
import type { Group, GroupExpense, GroupMember, GroupOutboxEntry, Settlement } from '@/lib/groupTypes'
import type {
  Budget,
  Category,
  ImportBatch,
  LedgerEntry,
  PaymentMethod,
  Person,
  Recurring,
  Settings,
  Transaction,
} from '@/lib/types'
import { createSyncMiddleware, markRemote, type OutboxEntry } from './syncMiddleware'

/** Personal app data tables — all of them are backed up and synced to the owner's private cloud copy. */
export const ALL_TABLES = [
  'settings',
  'categories',
  'paymentMethods',
  'budgets',
  'transactions',
  'people',
  'ledger',
  'recurring',
  'importBatches',
] as const

export type TableName = (typeof ALL_TABLES)[number]

export interface SyncStateRow {
  key: string
  value: unknown
}

export interface GroupSyncStateRow {
  groupId: string
  lastRev: number
}

export const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'upi-navi', label: 'UPI · Navi', type: 'upi', order: 0, archived: false },
  { id: 'upi-gpay', label: 'UPI · Google Pay', type: 'upi', order: 1, archived: false },
  { id: 'upi-phonepe', label: 'UPI · PhonePe', type: 'upi', order: 2, archived: false },
  { id: 'cash', label: 'Cash', type: 'cash', order: 3, archived: false },
  { id: 'card', label: 'Card', type: 'card', order: 4, archived: false },
]

export function defaultSettings(): Settings {
  return {
    id: 'app',
    monthStartDay: 1,
    defaultPaymentMethodId: 'upi-navi',
    theme: 'dark',
    lastBackupAt: null,
    createdAt: Date.now(),
  }
}

export function defaultCategories(): Category[] {
  return DEFAULT_CATEGORIES.map((c, order) => ({ ...c, order, archived: false, builtIn: true }))
}

export class KharchaDB extends Dexie {
  settings!: EntityTable<Settings, 'id'>
  categories!: EntityTable<Category, 'id'>
  paymentMethods!: EntityTable<PaymentMethod, 'id'>
  budgets!: EntityTable<Budget, 'monthKey'>
  transactions!: EntityTable<Transaction, 'id'>
  people!: EntityTable<Person, 'id'>
  ledger!: EntityTable<LedgerEntry, 'id'>
  recurring!: EntityTable<Recurring, 'id'>
  importBatches!: EntityTable<ImportBatch, 'id'>
  /** Local changes waiting to be uploaded (one entry per record, latest change wins). */
  syncOutbox!: Table<OutboxEntry, [string, string]>
  /** Sync bookkeeping: linked user id, last pulled revision, last sync time. */
  syncState!: Table<SyncStateRow, string>

  // Shared groups: a local cache of the groups this user belongs to, plus their own upload queue.
  groups!: EntityTable<Group, 'id'>
  groupMembers!: EntityTable<GroupMember, 'id'>
  groupExpenses!: EntityTable<GroupExpense, 'id'>
  groupSettlements!: EntityTable<Settlement, 'id'>
  groupOutbox!: Table<GroupOutboxEntry, [string, string, string]>
  groupSyncState!: Table<GroupSyncStateRow, string>

  constructor(name = 'kharcha') {
    super(name)
    this.version(1).stores({
      settings: 'id',
      categories: 'id, order',
      paymentMethods: 'id, order',
      budgets: 'monthKey',
      transactions: 'id, occurredAt, categoryId, nameLower, paidByPersonId, importBatchId, recurringId',
      people: 'id, nameLower',
      ledger: 'id, personId, occurredAt, transactionId, importBatchId',
      recurring: 'id',
      importBatches: 'id, createdAt',
    })
    this.version(2).stores({
      syncOutbox: '[table+id], updatedAt',
      syncState: 'key',
    })
    this.version(3).stores({
      transactions: 'id, occurredAt, categoryId, nameLower, paidByPersonId, importBatchId, recurringId, groupExpenseId',
      groups: 'id',
      groupMembers: 'id, groupId, userId',
      groupExpenses: 'id, groupId, occurredAt',
      groupSettlements: 'id, groupId, expenseId',
      groupOutbox: '[groupId+kind+id], updatedAt',
      groupSyncState: 'groupId',
    })

    this.use(createSyncMiddleware(ALL_TABLES))

    this.on('populate', async (tx) => {
      // Defaults are identical on every device, so they are not queued for upload.
      markRemote(tx)
      await tx.table('settings').add(defaultSettings())
      await tx.table('categories').bulkAdd(defaultCategories())
      await tx.table('paymentMethods').bulkAdd(DEFAULT_PAYMENT_METHODS)
    })
  }
}

export const db = new KharchaDB()
