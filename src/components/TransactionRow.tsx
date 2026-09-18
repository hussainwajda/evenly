import { CategoryIcon } from '@/components/CategoryIcon'
import { formatTime } from '@/lib/dates'
import { formatINR } from '@/lib/money'
import type { Category, PaymentMethod, Person, Transaction } from '@/lib/types'

export function TransactionRow({
  txn,
  category,
  method,
  peopleMap,
  onClick,
  showTime = true,
}: {
  txn: Transaction
  category: Category | undefined
  method: PaymentMethod | undefined
  peopleMap: Map<string, Person>
  onClick?: () => void
  showTime?: boolean
}) {
  const parts: string[] = [category?.name ?? 'Uncategorised']
  if (txn.groupExpenseId) parts.push(txn.groupPaidBy ? `Shared · paid by ${txn.groupPaidBy}` : 'Shared')
  else if (txn.paidByPersonId) parts.push(`Paid by ${peopleMap.get(txn.paidByPersonId)?.name ?? 'friend'}`)
  else if (txn.shares.length) {
    const names = txn.shares.map((s) => peopleMap.get(s.personId)?.name ?? '?')
    parts.push(txn.amount === 0 ? `For ${names.join(', ')}` : `Split with ${names.length === 1 ? names[0] : `${names.length} people`}`)
  } else if (method) parts.push(method.label)
  if (showTime) parts.push(formatTime(txn.occurredAt))

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-accent/60"
    >
      <CategoryIcon icon={category?.icon} color={category?.color} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{txn.name}</p>
        <p className="truncate text-sm text-muted-foreground">{parts.join(' · ')}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="money font-semibold">{formatINR(txn.amount)}</p>
        {txn.groupExpenseId ? (
          txn.groupBill && txn.groupBill !== txn.amount ? (
            <p className="money text-xs text-muted-foreground">of {formatINR(txn.groupBill)}</p>
          ) : null
        ) : txn.grossAmount !== txn.amount ? (
          <p className="money text-xs text-muted-foreground">of {formatINR(txn.grossAmount)}</p>
        ) : txn.excludeFromSpend ? (
          <p className="text-xs text-muted-foreground">Not in spend</p>
        ) : null}
      </div>
    </button>
  )
}
