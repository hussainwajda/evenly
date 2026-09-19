import { ArrowRight, ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { Section } from '@/components/common'
import { FormSheet } from '@/components/FormParts'
import { memberLabel, useGroupData } from '@/hooks/useGroups'
import { netBreakdown, pairwiseDebts } from '@/lib/groupMath'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useUi } from '@/stores/ui'

const lc = (s: string) => (s === 'You' ? 'you' : s)

/** Explains a simplified payment: each person's total, and the direct debts it replaces. */
export function SimplifyExplainSheet() {
  const sheet = useUi((s) => s.explainSheet)
  const close = useUi((s) => s.closeExplain)
  const navigate = useNavigate()
  const data = useGroupData(sheet.groupId)

  const view = useMemo(() => {
    if (!data || !sheet.from || !sheet.to) return null
    const direct = pairwiseDebts(data.expenses, data.settlements)
    const suggested = data.transfers.find((t) => t.from === sheet.from && t.to === sheet.to) ?? null
    const people = [sheet.from, sheet.to].map((id) => ({ id, ...netBreakdown(data.expenses, data.settlements, id) }))
    const involved = direct.filter((d) => d.from === sheet.from || d.to === sheet.to || d.from === sheet.to || d.to === sheet.from)
    const others = direct.filter((d) => !involved.includes(d))
    const directBetween = direct.find((d) => (d.from === sheet.from && d.to === sheet.to) || (d.from === sheet.to && d.to === sheet.from)) ?? null
    return { direct, suggested, people, involved, others, directBetween }
  }, [data, sheet.from, sheet.to])

  const from = data ? memberLabel(data, sheet.from) : ''
  const to = data ? memberLabel(data, sheet.to) : ''

  return (
    <FormSheet open={sheet.open} onOpenChange={(o) => !o && close()} title="Why this amount?" description={data ? data.group.name : undefined}>
      {!data || !view ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">Suggested payment</p>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-lg font-semibold">
              {from} <ArrowRight className="size-4 text-muted-foreground" aria-label="pays" /> {to}
              <span className="money ml-auto">{view.suggested ? formatINR(view.suggested.amount) : '—'}</span>
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              This group has <span className="font-medium text-foreground">simplify debts</span> on. Evenly adds up everyone's balance and suggests the fewest
              payments. <span className="font-medium text-foreground">Nobody pays more or less overall</span>; only who pays whom changes.
            </p>
            {view.suggested ? <DifferenceNote from={from} to={to} suggested={view.suggested.amount} direct={directOwed(view.directBetween, sheet.from)} /> : null}
          </div>

          <Section title="Each person's total in this group">
            <div className="grid gap-3 sm:grid-cols-2">
              {view.people.map((p) => (
                <div key={p.id} className="rounded-2xl border bg-card p-4 text-sm">
                  <p className="mb-2 font-semibold">{memberLabel(data, p.id)}</p>
                  <dl className="space-y-1">
                    <Line label="Paid for bills" value={formatINR(p.paid)} />
                    <Line label="Share of bills" value={`− ${formatINR(p.share)}`} />
                    {p.sent ? <Line label="Payments sent" value={`+ ${formatINR(p.sent)}`} /> : null}
                    {p.received ? <Line label="Payments received" value={`− ${formatINR(p.received)}`} /> : null}
                    <div className="flex justify-between border-t pt-1.5 font-semibold">
                      <dt>{p.net > 0 ? 'Gets back' : p.net < 0 ? 'Owes overall' : 'Settled'}</dt>
                      <dd className={cn('money', p.net > 0 ? 'text-positive' : p.net < 0 ? 'text-negative' : 'text-muted-foreground')}>
                        {formatINR(Math.abs(p.net))}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Direct debts it replaces">
            <p className="px-1 text-sm text-muted-foreground">Who owes whom bill by bill, before simplifying. Tap one to see every bill and payment behind it.</p>
            <ul className="divide-y rounded-2xl border bg-card">
              {[...view.involved, ...view.others].map((d) => {
                const relevant = view.involved.includes(d)
                return (
                  <li key={`${d.from}>${d.to}`}>
                    <button
                      type="button"
                      className={cn('flex min-h-12 w-full items-center gap-2 px-4 py-2.5 text-left text-sm active:bg-accent/60', !relevant && 'text-muted-foreground')}
                      onClick={() => {
                        close()
                        navigate(`/groups/${data.group.id}/with/${d.to}?and=${d.from}`)
                      }}
                    >
                      <span className="min-w-0 flex-1">
                        {memberLabel(data, d.from)} {memberLabel(data, d.from) === 'You' ? 'owe' : 'owes'} {lc(memberLabel(data, d.to))}
                      </span>
                      <span className="money font-semibold">{formatINR(d.amount)}</span>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </button>
                  </li>
                )
              })}
              {!view.direct.length ? <li className="px-4 py-3 text-sm text-muted-foreground">No direct debts.</li> : null}
            </ul>
          </Section>

          <p className="px-1 text-xs text-muted-foreground">Prefer seeing only direct debts? The group owner or any member can turn off simplify debts from the group's ⋮ menu.</p>
        </div>
      )}
    </FormSheet>
  )
}

/** What `from` owes `to` directly (negative when it's the other way round). */
function directOwed(d: { from: string; to: string; amount: number } | null, from: string | null): number {
  if (!d) return 0
  return d.from === from ? d.amount : -d.amount
}

function DifferenceNote({ from, to, suggested, direct }: { from: string; to: string; suggested: number; direct: number }) {
  const pays = from === 'You' ? 'pay' : 'pays'
  const owesVerb = from === 'You' ? 'owe' : 'owes'
  const diff = suggested - direct
  const directText =
    direct > 0 ? `Directly, ${lc(from)} ${owesVerb} ${lc(to)} ${formatINR(direct)}.` : direct < 0 ? `Directly, it's ${lc(to)} who owes ${lc(from)} ${formatINR(-direct)}.` : `${from} and ${lc(to)} don't owe each other directly.`
  if (!diff) return <p className="mt-2 text-sm text-muted-foreground">{directText} The simplified payment is the same amount.</p>
  return (
    <p className="mt-2 text-sm text-muted-foreground">
      {directText}{' '}
      {diff > 0
        ? `The simplified payment is ${formatINR(diff)} more: ${lc(from)} ${pays} that part straight to ${lc(to)} instead of to someone else who owes ${lc(to)}.`
        : `The simplified payment is ${formatINR(-diff)} less: that part reaches ${lc(to)} from someone else who owes ${lc(from)}.`}
    </p>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="money">{value}</dd>
    </div>
  )
}
