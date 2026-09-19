import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, CircleCheck, CircleX, Clock, Pencil, RotateCcw, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Section } from '@/components/common'
import { FormSheet } from '@/components/FormParts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { db } from '@/db'
import { type GroupData, memberLabel, useGroupData } from '@/hooks/useGroups'
import { formatShortDate, formatTime } from '@/lib/dates'
import { canConfirmPayment, canManagePayment, paymentAllocations } from '@/lib/groupMath'
import type { Settlement, SettlementEvent } from '@/lib/groupTypes'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useUi } from '@/stores/ui'
import { groupsApi, useSyncStore } from '@/sync/controller'
import { deleteSettlement, restoreSettlement, setSettlementStatus } from '@/sync/groupEngine'
import type { ActivityItem } from '@/sync/groupRemote'

const lc = (s: string) => (s === 'You' ? 'you' : s)

export function paymentStatusLabel(s: Settlement): { text: string; tone: 'positive' | 'negative' | 'muted' } {
  if (s.deletedAt) return { text: 'Deleted · not counted', tone: 'muted' }
  if (s.status === 'disputed') return { text: 'Not received · not counted', tone: 'negative' }
  if (s.status === 'recorded') return { text: 'Waiting for confirmation', tone: 'muted' }
  return { text: 'Confirmed', tone: 'positive' }
}

interface TimelineEntry {
  key: string
  at: number
  who: string
  text: string
  icon: typeof Clock
}

const ACTION_TEXT: Record<SettlementEvent['action'], string> = {
  recorded: 'recorded this payment',
  confirmed: 'confirmed receiving it',
  disputed: 'said it never arrived',
  edited: 'changed the amount',
  deleted: 'deleted it',
  restored: 'restored it',
}
const ACTION_ICON: Record<SettlementEvent['action'], typeof Clock> = {
  recorded: Clock,
  confirmed: CircleCheck,
  disputed: CircleX,
  edited: Pencil,
  deleted: Trash2,
  restored: RotateCcw,
}

/** Server log rows → the same shape as the payment's own history (for payments recorded before history existed). */
function fromServer(item: ActivityItem, data: GroupData): TimelineEntry {
  const member = item.actor ? data.members.find((m) => m.userId === item.actor) : undefined
  const who = member ? memberLabel(data, member.id) : 'Someone'
  const s = item.summary ?? {}
  const kind = item.action.split('.')[1]
  let action: SettlementEvent['action'] = 'edited'
  if (kind === 'created') action = 'recorded'
  else if (kind === 'deleted') action = 'deleted'
  else if (kind === 'restored') action = 'restored'
  else if (s.prevStatus !== undefined && s.status === 'confirmed') action = 'confirmed'
  else if (s.prevStatus !== undefined && s.status === 'disputed') action = 'disputed'
  else if (s.status === 'confirmed' && s.prevAmount === undefined) action = 'confirmed'
  else if (s.status === 'disputed' && s.prevAmount === undefined) action = 'disputed'
  let text = ACTION_TEXT[action]
  if (action === 'edited' && typeof s.prevAmount === 'number' && typeof s.amount === 'number') {
    text = `changed the amount from ${formatINR(s.prevAmount)} to ${formatINR(s.amount)}`
  }
  return { key: `srv-${item.id}`, at: new Date(item.created_at).getTime(), who, text, icon: ACTION_ICON[action] }
}

export function PaymentDetailSheet() {
  const sheet = useUi((s) => s.paymentDetail)
  const close = useUi((s) => s.closePaymentDetail)
  const openGroupDetail = useUi((s) => s.openGroupDetail)
  const payment = useLiveQuery(() => (sheet.settlementId ? db.groupSettlements.get(sheet.settlementId) : undefined), [sheet.settlementId])
  const data = useGroupData(payment?.groupId ?? null)
  const signedIn = useSyncStore((s) => Boolean(s.user))
  const [server, setServer] = useState<ActivityItem[] | null>(null)

  const needsServer = Boolean(payment && !payment.history?.length)
  useEffect(() => {
    setServer(null)
    if (!sheet.open || !payment || !needsServer || !signedIn) return
    let cancelled = false
    void groupsApi()
      .then((api) => api.fetchRecordHistory(payment.groupId, payment.id))
      .then((rows) => !cancelled && setServer(rows))
      .catch(() => !cancelled && setServer([]))
    return () => {
      cancelled = true
    }
  }, [sheet.open, payment?.id, payment?.groupId, payment?.updatedAt, needsServer, signedIn]) // eslint-disable-line react-hooks/exhaustive-deps

  const paidOff = useMemo(() => (data && payment ? (paymentAllocations(data.statuses).get(payment.id) ?? []) : []), [data, payment])

  const timeline: TimelineEntry[] =
    payment && data
      ? payment.history?.length
        ? payment.history.map((h, i) => ({
            key: `h-${i}`,
            at: h.at,
            who: memberLabel(data, h.by),
            text:
              h.action === 'edited' && h.prevAmount !== undefined && h.amount !== undefined
                ? `changed the amount from ${formatINR(h.prevAmount)} to ${formatINR(h.amount)}`
                : ACTION_TEXT[h.action],
            icon: ACTION_ICON[h.action],
          }))
        : (server ?? []).map((row) => fromServer(row, data))
      : []

  const me = data?.meId ?? null
  const counted = payment ? !payment.deletedAt && payment.status !== 'disputed' : false
  const allocated = paidOff.reduce((a, p) => a + p.amount, 0)
  const bill = payment?.expenseId && data ? data.expenses.find((e) => e.id === payment.expenseId) : undefined

  async function act(fn: () => Promise<void>, done: string, undo?: () => Promise<void>) {
    try {
      await fn()
      toast(done, undo ? { action: { label: 'Undo', onClick: () => void undo().catch(() => {}) } } : undefined)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update the payment')
    }
  }

  const status = payment ? paymentStatusLabel(payment) : null

  return (
    <FormSheet open={sheet.open} onOpenChange={(o) => !o && close()} title="Payment" description={data ? data.group.name : undefined}>
      {!payment || !data ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{payment === undefined ? 'Loading…' : 'This payment is no longer here.'}</p>
      ) : (
        <div className="space-y-5">
          <div className="space-y-2">
            <p className={cn('text-3xl font-semibold tracking-tight', !counted && 'text-muted-foreground line-through')}>{formatINR(payment.amount)}</p>
            <p className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="font-medium">{memberLabel(data, payment.from)}</span>
              <ArrowRight className="size-4 text-muted-foreground" aria-label="paid" />
              <span className="font-medium">{memberLabel(data, payment.to)}</span>
              <span className="text-muted-foreground">
                · {payment.method.toUpperCase()} · {formatShortDate(payment.occurredAt)}
              </span>
            </p>
            {status ? (
              <Badge variant="secondary" className={cn(status.tone === 'positive' && 'text-positive', status.tone === 'negative' && 'text-negative')}>
                {status.text}
              </Badge>
            ) : null}
            {payment.note ? <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm">{payment.note}</p> : null}
          </div>

          <Section title="History">
            {timeline.length ? (
              <ol className="space-y-0">
                {timeline.map((t, i) => (
                  <li key={t.key} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < timeline.length - 1 ? <span className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-border" aria-hidden /> : null}
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                      <t.icon className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0 pt-1">
                      <p className="text-sm">
                        <span className="font-medium">{t.who}</span> {t.text}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatShortDate(t.at)}, {formatTime(t.at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">
                {needsServer && !signedIn
                  ? 'This payment was recorded before payment history existed. Sign in to load its history.'
                  : needsServer && server === null
                    ? 'Loading history…'
                    : 'No history recorded for this payment.'}
              </p>
            )}
          </Section>

          <Section title="What it paid off">
            {!counted ? (
              <p className="text-sm text-muted-foreground">Nothing: this payment isn't counted in balances.</p>
            ) : (
              <div className="space-y-2">
                {bill && !paidOff.length ? (
                  <p className="text-sm text-muted-foreground">Recorded for “{bill.title}”.</p>
                ) : null}
                {paidOff.length ? (
                  <ul className="divide-y rounded-2xl border bg-card">
                    {paidOff.map((p) => {
                      const e = data.expenses.find((x) => x.id === p.expenseId)
                      return (
                        <li key={`${p.expenseId}|${p.memberId}`}>
                          <button
                            type="button"
                            className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-accent/60"
                            onClick={() => {
                              close()
                              openGroupDetail(p.expenseId)
                            }}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{e?.title ?? 'A bill'}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {e ? formatShortDate(e.occurredAt) : ''} · {memberLabel(data, p.memberId)}'s share
                              </p>
                            </div>
                            <span className="money font-semibold">{formatINR(p.amount)}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
                {payment.amount - allocated > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {formatINR(payment.amount - allocated)} {allocated ? 'more ' : ''}isn't tied to a specific bill. It still reduces what{' '}
                    {lc(memberLabel(data, payment.from))} {memberLabel(data, payment.from) === 'You' ? 'owe' : 'owes'} {lc(memberLabel(data, payment.to))}{' '}
                    overall.
                  </p>
                ) : null}
              </div>
            )}
          </Section>

          <div className="space-y-2">
            {canConfirmPayment(payment, me) && !payment.deletedAt ? (
              payment.status === 'recorded' ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button className="h-11" onClick={() => void act(() => setSettlementStatus(db, [payment.id], 'confirmed'), 'Confirmed. Thanks!')}>
                    <CircleCheck aria-hidden /> Received
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-11 text-negative hover:text-negative"
                    onClick={() => void act(() => setSettlementStatus(db, [payment.id], 'disputed'), 'Marked as not received')}
                  >
                    <CircleX aria-hidden /> Not received
                  </Button>
                </div>
              ) : payment.status === 'disputed' ? (
                <Button className="h-11 w-full" onClick={() => void act(() => setSettlementStatus(db, [payment.id], 'confirmed'), 'Confirmed. Thanks!')}>
                  <CircleCheck aria-hidden /> Actually, I received it
                </Button>
              ) : null
            ) : payment.status === 'recorded' && !payment.deletedAt ? (
              <p className="text-sm text-muted-foreground">Only {memberLabel(data, payment.to)} can confirm this payment.</p>
            ) : null}

            {canManagePayment(payment, me) ? (
              payment.deletedAt ? (
                <Button variant="secondary" className="h-11 w-full" onClick={() => void act(() => restoreSettlement(db, payment.id), 'Payment restored')}>
                  <Undo2 aria-hidden /> Restore payment
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  className="h-11 w-full text-negative hover:text-negative"
                  onClick={() =>
                    void act(
                      () => deleteSettlement(db, payment.id),
                      'Payment deleted',
                      () => restoreSettlement(db, payment.id),
                    )
                  }
                >
                  <Trash2 aria-hidden /> Delete payment
                </Button>
              )
            ) : (
              <p className="text-xs text-muted-foreground">
                Only the person who recorded this payment, or {memberLabel(data, payment.to)} who received it, can delete it.
              </p>
            )}
          </div>
        </div>
      )}
    </FormSheet>
  )
}
