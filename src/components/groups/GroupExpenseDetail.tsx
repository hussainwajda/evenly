import { useLiveQuery } from 'dexie-react-hooks'
import { CircleCheck, Clock, Info, Pencil } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { CategoryIcon } from '@/components/CategoryIcon'
import { Section } from '@/components/common'
import { FormSheet } from '@/components/FormParts'
import { Avatar } from '@/components/PeoplePicker'
import { Button } from '@/components/ui/button'
import { db } from '@/db'
import { useCategoryMap } from '@/hooks/useData'
import { memberLabel, useGroupData } from '@/hooks/useGroups'
import { formatShortDate } from '@/lib/dates'
import { canConfirmPayment, type ShareStatus } from '@/lib/groupMath'
import type { Settlement } from '@/lib/groupTypes'
import { formatINR } from '@/lib/money'
import { cn, uid } from '@/lib/utils'
import { useUi } from '@/stores/ui'
import { saveSettlement, setSettlementStatus } from '@/sync/groupEngine'

export function GroupExpenseDetail() {
  const sheet = useUi((s) => s.groupDetail)
  const close = useUi((s) => s.closeGroupDetail)
  const openGroupExpense = useUi((s) => s.openGroupExpense)
  const openPaymentDetail = useUi((s) => s.openPaymentDetail)
  const navigate = useNavigate()
  const categoryMap = useCategoryMap()
  const expense = useLiveQuery(() => (sheet.expenseId ? db.groupExpenses.get(sheet.expenseId) : undefined), [sheet.expenseId])
  const data = useGroupData(expense?.groupId ?? null)

  const statuses: ShareStatus[] = expense && data ? (data.statuses.get(expense.id) ?? []) : []
  const payerId = expense?.payers.find((p) => p.amount > 0)?.memberId ?? null
  const me = data?.meId ?? null

  async function iPaid(st: ShareStatus) {
    if (!expense || !payerId) return
    await saveSettlement(db, {
      id: uid(),
      groupId: expense.groupId,
      from: st.memberId,
      to: payerId,
      amount: st.remaining,
      method: 'upi',
      occurredAt: Date.now(),
      note: `For ${expense.title}`,
      expenseId: expense.id,
      status: st.memberId === me ? 'recorded' : 'confirmed',
    })
    toast.success(st.memberId === me ? `Marked your ${formatINR(st.remaining)} as paid` : `Marked ${memberLabel(data!, st.memberId)} as paid`)
  }

  async function respond(st: ShareStatus, status: 'confirmed' | 'disputed') {
    if (!expense || !data) return
    const ids = st.coveredBy
      .map((c) => data.settlements.find((s) => s.id === c.settlementId))
      .filter((s): s is Settlement => Boolean(s && s.status === 'recorded' && canConfirmPayment(s, me)))
      .map((s) => s.id)
    try {
      await setSettlementStatus(db, ids, status)
      toast(status === 'confirmed' ? 'Confirmed. Thanks!' : 'Marked as not received')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update the payment')
    }
  }

  const category = expense ? categoryMap.get(expense.categoryId) : undefined

  return (
    <FormSheet
      open={sheet.open}
      onOpenChange={(o) => !o && close()}
      title={expense?.title ?? 'Shared expense'}
      description={data ? data.group.name : undefined}
      footer={
        expense && !expense.deletedAt ? (
          <Button
            variant="secondary"
            className="h-12 flex-1"
            onClick={() => {
              close()
              openGroupExpense({ groupId: expense.groupId, editId: expense.id })
            }}
          >
            <Pencil aria-hidden /> Edit
          </Button>
        ) : undefined
      }
    >
      {!expense || !data ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : expense.deletedAt ? (
        <p className="py-6 text-center text-sm text-muted-foreground">This expense was deleted.</p>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <CategoryIcon icon={category?.icon} color={category?.color} size="lg" />
            <div className="min-w-0">
              <p className="text-3xl font-semibold tracking-tight">{formatINR(expense.amount)}</p>
              <p className="text-sm text-muted-foreground">
                Paid by {memberLabel(data, payerId).replace(/^You$/, 'you')} · {formatShortDate(expense.occurredAt)}
                {category ? ` · ${category.name}` : ''}
              </p>
            </div>
          </div>
          {expense.note ? <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm">{expense.note}</p> : null}

          <Section title="Who owes what">
            <ul className="divide-y rounded-2xl border bg-card">
              {statuses.map((st) => {
                const who = memberLabel(data, st.memberId)
                const isMe = st.memberId === me
                const payerName = memberLabel(data, st.payerId)
                return (
                  <li key={st.memberId} className="space-y-2 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={data.memberMap.get(st.memberId)?.displayName ?? '?'} className="size-9 text-xs" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{who}</p>
                        <p
                          className={cn(
                            'flex items-center gap-1 text-sm',
                            st.state === 'confirmed' ? 'text-positive' : st.state === 'pending' || st.state === 'partial' ? 'text-negative' : 'text-muted-foreground',
                          )}
                        >
                          {st.state === 'confirmed' ? <CircleCheck className="size-3.5" aria-hidden /> : null}
                          {st.state === 'paid' && !st.settledOverall ? <Clock className="size-3.5" aria-hidden /> : null}
                          {st.state === 'payer'
                            ? 'Paid the bill'
                            : st.state === 'pending'
                              ? `${isMe ? 'Owe' : 'Owes'} ${payerName.toLowerCase() === 'you' ? 'you' : payerName} ${formatINR(st.remaining)}`
                              : st.state === 'partial'
                                ? `Paid ${formatINR(st.paid)} · ${formatINR(st.remaining)} left`
                                : st.state === 'paid'
                                  ? st.settledOverall
                                    ? 'Balanced out'
                                    : `Marked paid · waiting for ${payerName.toLowerCase() === 'you' ? 'you' : payerName} to confirm`
                                  : 'Settled'}
                        </p>
                      </div>
                      <span className="money font-semibold">{formatINR(st.share)}</span>
                    </div>

                    {st.settledOverall ? (
                      <p className="flex gap-1.5 rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
                        No payment was recorded for this bill. It shows as done because simplify debts is on and {isMe ? 'your' : `${who}'s`} overall balance
                        in the group is clear.
                      </p>
                    ) : null}
                    {st.coveredBy.length ? (
                      <ul className="space-y-1 pl-12">
                        {st.coveredBy.map((c) => {
                          const s = data.allSettlements.find((x) => x.id === c.settlementId)
                          if (!s) return null
                          const by = s.createdBy ? memberLabel(data, s.createdBy) : null
                          return (
                            <li key={c.settlementId}>
                              <button
                                type="button"
                                className="text-left text-xs text-muted-foreground underline-offset-4 hover:underline"
                                onClick={() => openPaymentDetail(s.id)}
                              >
                                {formatINR(c.amount)} covered by {s.expenseId === expense.id ? 'a payment for this bill' : `a ${formatINR(s.amount)} payment`} on{' '}
                                {formatShortDate(s.occurredAt)}
                                {by ? ` · recorded by ${by === 'You' ? 'you' : by}` : ''}
                                {s.status === 'confirmed' ? ' · confirmed' : ' · not confirmed yet'}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    ) : null}

                    {(st.state === 'pending' || st.state === 'partial') && isMe ? (
                      <Button className="h-11 w-full" onClick={() => void iPaid(st)}>
                        I've paid {formatINR(st.remaining)}
                      </Button>
                    ) : null}
                    {(st.state === 'pending' || st.state === 'partial') && !isMe && st.payerId === me ? (
                      <Button variant="secondary" className="h-11 w-full" onClick={() => void iPaid(st)}>
                        Mark {who} as paid
                      </Button>
                    ) : null}
                    {st.state === 'paid' && !st.settledOverall && st.payerId === me ? (
                      <div className="grid grid-cols-2 gap-2">
                        <Button className="h-11" onClick={() => void respond(st, 'confirmed')}>
                          Received
                        </Button>
                        <Button variant="ghost" className="h-11 text-negative hover:text-negative" onClick={() => void respond(st, 'disputed')}>
                          Not received
                        </Button>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </Section>

          <Button
            variant="ghost"
            className="h-11 w-full"
            onClick={() => {
              close()
              navigate(`/groups/${expense.groupId}`)
            }}
          >
            Open {data.group.name}
          </Button>
        </div>
      )}
    </FormSheet>
  )
}
