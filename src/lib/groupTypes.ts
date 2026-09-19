/** Shared groups. Money is integer paise; timestamps are epoch ms; member ids are group-member ids (not user ids). */

export type GroupKind = 'home' | 'trip' | 'couple' | 'work' | 'friends' | 'other'

export interface Group {
  id: string
  name: string
  kind: GroupKind
  /** Group-wide: show the fewest payments instead of who owes whom directly. Off by default. */
  simplifyDebts: boolean
  createdBy: string
  createdAt: number
  updatedAt: number
}

export interface GroupMember {
  id: string
  groupId: string
  /** null = added by name, hasn't joined yet */
  userId: string | null
  displayName: string
  role: 'owner' | 'member'
  joinedAt: number | null
  leftAt: number | null
  upiId: string | null
  avatarUrl: string | null
}

export type GroupSplitMethod = 'equal' | 'exact' | 'percent' | 'shares'

export interface MemberAmount {
  memberId: string
  amount: number
}

export interface SplitEntry {
  memberId: string
  /** equal: 1 = included · exact: paise · percent: basis points (33.33% = 3333) · shares: weight */
  value: number
}

export interface GroupExpense {
  id: string
  groupId: string
  title: string
  amount: number
  categoryId: string
  occurredAt: number
  note: string
  createdBy: string
  payers: MemberAmount[]
  split: { method: GroupSplitMethod; entries: SplitEntry[] }
  /** Computed from split; always adds up to amount. */
  shares: MemberAmount[]
  updatedAt: number
  deletedAt: number | null
}

export type SettlementMethod = 'upi' | 'cash' | 'bank' | 'other'
export type SettlementStatus = 'recorded' | 'confirmed' | 'disputed'

export type SettlementAction = 'recorded' | 'confirmed' | 'disputed' | 'edited' | 'deleted' | 'restored'

/** One step in a payment's history. `by` is a group-member id. */
export interface SettlementEvent {
  at: number
  by: string | null
  action: SettlementAction
  /** For 'edited': the new and the previous amount. */
  amount?: number
  prevAmount?: number
}

export interface Settlement {
  id: string
  groupId: string
  from: string
  to: string
  amount: number
  method: SettlementMethod
  occurredAt: number
  note: string
  /** Set when paying a specific expense share ("I've paid"). */
  expenseId: string | null
  status: SettlementStatus
  updatedAt: number
  deletedAt: number | null
  /** Member who recorded it. Missing on payments made before payment history existed. */
  createdBy?: string | null
  createdAt?: number
  /** Append-only log of who did what (newest last). */
  history?: SettlementEvent[]
}

export type GroupRecordKind = 'expense' | 'settlement'

export interface GroupOutboxEntry {
  groupId: string
  kind: GroupRecordKind
  id: string
  updatedAt: number
}
