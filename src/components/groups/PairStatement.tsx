import { Handshake, ReceiptText } from 'lucide-react'
import { CategoryIcon } from '@/components/CategoryIcon'
import { paymentStatusLabel } from '@/components/groups/PaymentDetailSheet'
import { useCategoryMap } from '@/hooks/useData'
import { type GroupData, memberLabel } from '@/hooks/useGroups'
import { formatShortDate } from '@/lib/dates'
import type { PairRow } from '@/lib/groupMath'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useUi } from '@/stores/ui'

const lc = (s: string) => (s === 'You' ? 'you' : s)
const owes = (who: string) => (who === 'You' ? 'owe' : 'owes')

/** "b owes a" as a sentence, from `a`'s point of view. */
export function pairBalanceText(data: Pick<GroupData, 'meId' | 'memberMap'>, balance: number, a: string, b: string): string {
  const an = memberLabel(data, a)
  const bn = memberLabel(data, b)
  if (balance > 0) return `${bn} ${owes(bn)} ${lc(an)} ${formatINR(balance)}`
  if (balance < 0) return `${an} ${owes(an)} ${lc(bn)} ${formatINR(-balance)}`
  return `${an} and ${lc(bn)} are all square`
}

/** Rows of a two-person statement: each bill or payment, how it moved the balance, and the balance after. */
export function PairRows({ data, rows, a, b }: { data: GroupData; rows: PairRow[]; a: string; b: string }) {
  const categoryMap = useCategoryMap()
  const openGroupDetail = useUi((s) => s.openGroupDetail)
  const openPaymentDetail = useUi((s) => s.openPaymentDetail)
  const an = memberLabel(data, a)
  const bn = memberLabel(data, b)
  const mine = a === data.meId

  return (
    <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
      {rows.map((row) => {
        const deltaTone = !row.counts || !row.delta ? 'text-muted-foreground' : !mine ? '' : row.delta > 0 ? 'text-positive' : 'text-negative'
        const after = row.running > 0 ? `${bn} ${owes(bn)} ${formatINR(row.running)}` : row.running < 0 ? `${an} ${owes(an)} ${formatINR(-row.running)}` : 'All square'

        if (row.kind === 'expense') {
          const e = row.expense!
          const cat = categoryMap.get(e.categoryId)
          const payers = e.payers.filter((p) => p.amount > 0).map((p) => memberLabel(data, p.memberId))
          const reasons: string[] = []
          if (row.bOwesA) reasons.push(`${bn === 'You' ? 'your' : `${bn}'s`} share ${formatINR(row.bOwesA)} → ${lc(bn)} ${owes(bn)} ${lc(an)}`)
          if (row.aOwesB) reasons.push(`${an === 'You' ? 'your' : `${an}'s`} share ${formatINR(row.aOwesB)} → ${lc(an)} ${owes(an)} ${lc(bn)}`)
          return (
            <li key={`e-${row.id}`}>
              <button
                type="button"
                disabled={!row.counts}
                onClick={() => openGroupDetail(e.id)}
                className="flex min-h-16 w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-accent/60 disabled:opacity-60"
              >
                <CategoryIcon icon={cat?.icon} color={cat?.color} />
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate font-medium', !row.counts && 'line-through')}>{e.title}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {payers.join(' & ')} paid {formatINR(e.amount)} · {formatShortDate(e.occurredAt)}
                  </p>
                  <p className="text-sm">{row.counts ? reasons.join(' · ') : 'Deleted · not counted'}</p>
                </div>
                <Change delta={row.delta} tone={deltaTone} after={after} />
              </button>
            </li>
          )
        }

        const s = row.settlement!
        const status = paymentStatusLabel(s)
        const recorder = s.createdBy ? memberLabel(data, s.createdBy) : null
        return (
          <li key={`s-${row.id}`}>
            <button
              type="button"
              onClick={() => openPaymentDetail(s.id)}
              className="flex min-h-16 w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-accent/60"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                <Handshake className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('truncate font-medium', !row.counts && 'line-through')}>
                  {memberLabel(data, s.from)} paid {lc(memberLabel(data, s.to))}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {formatShortDate(s.occurredAt)} · {s.method.toUpperCase()}
                  {recorder ? ` · recorded by ${lc(recorder)}` : ''}
                </p>
                <p className={cn('text-sm', status.tone === 'positive' && 'text-positive', status.tone === 'negative' && 'text-negative', status.tone === 'muted' && 'text-muted-foreground')}>
                  {status.text}
                </p>
              </div>
              <Change delta={row.counts ? row.delta : 0} amount={s.amount} tone={deltaTone} after={after} />
            </button>
          </li>
        )
      })}
      {!rows.length ? (
        <li className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
          <ReceiptText className="size-6" aria-hidden />
          Nothing matches these filters.
        </li>
      ) : null}
    </ul>
  )
}

function Change({ delta, amount, tone, after }: { delta: number; amount?: number; tone: string; after: string }) {
  return (
    <div className="shrink-0 text-right">
      <p className={cn('money font-semibold', tone)}>{delta ? formatINR(delta, { signed: true }) : formatINR(amount ?? 0)}</p>
      <p className="max-w-32 text-xs text-muted-foreground">{after}</p>
    </div>
  )
}
