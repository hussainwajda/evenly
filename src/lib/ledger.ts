import type { LedgerEntry, LedgerType, Transaction } from './types'

/** +1 means the person owes me more; −1 means I owe them more. */
export const LEDGER_SIGN: Record<LedgerType, 1 | -1> = {
  lent: 1,
  repaid: 1,
  borrowed: -1,
  received: -1,
}

export const LEDGER_LABEL: Record<LedgerType, string> = {
  lent: 'You lent',
  borrowed: 'You borrowed',
  received: 'They paid you back',
  repaid: 'You paid back',
}

type EntryLike = Pick<LedgerEntry, 'personId' | 'type' | 'amount' | 'deletedAt'>

/** Positive = they owe me. Negative = I owe them. */
export function personBalance(entries: EntryLike[]): number {
  let total = 0
  for (const e of entries) if (!e.deletedAt) total += LEDGER_SIGN[e.type] * e.amount
  return total
}

export function balancesByPerson(entries: EntryLike[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const e of entries) {
    if (e.deletedAt) continue
    map.set(e.personId, (map.get(e.personId) ?? 0) + LEDGER_SIGN[e.type] * e.amount)
  }
  return map
}

export function ledgerTotals(balances: Iterable<number>): { owedToMe: number; iOwe: number; net: number } {
  let owedToMe = 0
  let iOwe = 0
  for (const b of balances) {
    if (b > 0) owedToMe += b
    else iOwe += -b
  }
  return { owedToMe, iOwe, net: owedToMe - iOwe }
}

export type DerivedLedger = Pick<LedgerEntry, 'personId' | 'type' | 'amount' | 'occurredAt' | 'note' | 'paymentMethodId'>

/**
 * Ledger entries implied by an expense:
 *  • someone else paid → I borrowed my share from them
 *  • I paid a split bill → each other person owes their share (lent)
 */
export function ledgerEntriesForTransaction(
  txn: Pick<Transaction, 'name' | 'amount' | 'occurredAt' | 'paymentMethodId' | 'paidByPersonId' | 'shares'>,
): DerivedLedger[] {
  if (txn.paidByPersonId) {
    return [
      {
        personId: txn.paidByPersonId,
        type: 'borrowed',
        amount: txn.amount,
        occurredAt: txn.occurredAt,
        note: `Paid for: ${txn.name}`,
        paymentMethodId: null,
      },
    ]
  }
  return txn.shares
    .filter((s) => s.amount > 0)
    .map((s) => ({
      personId: s.personId,
      type: 'lent' as const,
      amount: s.amount,
      occurredAt: txn.occurredAt,
      note: `Share of: ${txn.name}`,
      paymentMethodId: txn.paymentMethodId,
    }))
}

/** "₹500 · they owe you" style phrasing for a balance. */
export function describeBalance(balance: number): 'owes you' | 'you owe' | 'settled' {
  if (balance > 0) return 'owes you'
  if (balance < 0) return 'you owe'
  return 'settled'
}
