import { Download, Handshake, Search, Share2, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyState, PageHeader, Panel, Segmented } from '@/components/common'
import { NativeSelect } from '@/components/FormParts'
import { PairRows, pairBalanceText } from '@/components/groups/PairStatement'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { memberLabel, useGroupData } from '@/hooks/useGroups'
import { formatMonthKey, monthKeyOf } from '@/lib/dates'
import { downloadBlob } from '@/lib/download'
import { pairLedger } from '@/lib/groupMath'
import { statementCsv, statementText } from '@/lib/groupStatement'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'
import { useUi } from '@/stores/ui'

type Kind = 'all' | 'bills' | 'payments'

/** Statement between two members of a group: every bill and payment behind their direct balance. */
export function GroupPairPage() {
  const { id = '', memberId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const data = useGroupData(id)
  const openSettle = useUi((s) => s.openSettle)
  const [kind, setKind] = useState<Kind>('all')
  const [month, setMonth] = useState('all')
  const [showHidden, setShowHidden] = useState(false)
  const [query, setQuery] = useState('')

  // `a` is whose point of view the statement takes: me when I'm one of the two.
  let a = params.get('and') ?? data?.meId ?? ''
  let b = memberId
  if (data?.meId && b === data.meId && a !== b) [a, b] = [b, a]

  const ledger = useMemo(() => (data && a && b ? pairLedger(data.allExpenses, data.allSettlements, a, b) : null), [data, a, b])

  const months = useMemo(() => {
    if (!ledger) return []
    return [...new Set(ledger.rows.map((r) => monthKeyOf(r.at)))].sort().reverse()
  }, [ledger])

  const rows = useMemo(() => {
    if (!ledger) return []
    const q = query.trim().toLowerCase()
    return ledger.rows
      .filter((r) => showHidden || r.counts)
      .filter((r) => kind === 'all' || (kind === 'bills' ? r.kind === 'expense' : r.kind === 'settlement'))
      .filter((r) => month === 'all' || monthKeyOf(r.at) === month)
      .filter((r) => !q || (r.expense?.title ?? r.settlement?.note ?? '').toLowerCase().includes(q) || (r.kind === 'settlement' && 'payment'.includes(q)))
      .reverse()
  }, [ledger, kind, month, showHidden, query])

  if (data === undefined) return <PageHeader title="Statement" backTo={`/groups/${id}`} />
  if (data === null || !data.memberMap.get(b) || !data.memberMap.get(a) || a === b || !ledger) {
    return (
      <>
        <PageHeader title="Statement" backTo={`/groups/${id}`} />
        <EmptyState icon={Users} title="Can't show this statement" description="One of these people isn't in this group on this device." />
      </>
    )
  }

  const an = memberLabel(data, a)
  const bn = memberLabel(data, b)
  const realName = (m: string | null | undefined) => (m ? (data.memberMap.get(m)?.displayName ?? 'Someone') : 'Someone')
  const counted = ledger.rows.filter((r) => r.counts)
  const bills = counted.filter((r) => r.kind === 'expense').length
  const payments = counted.filter((r) => r.kind === 'settlement').length
  const filtered = kind !== 'all' || month !== 'all' || query.trim() !== ''
  const scope = [kind === 'bills' ? 'bills only' : kind === 'payments' ? 'payments only' : 'all bills and payments', month === 'all' ? 'all time' : formatMonthKey(month, true)].join(', ')
  const iAmIn = data.meId === a || data.meId === b

  function exportRows() {
    return rows.slice().reverse() // oldest first for reading
  }

  async function share() {
    const text = statementText({ ledger: ledger!, rows: exportRows(), a, b, name: realName, groupName: data!.group.name, scope })
    if (navigator.share) {
      try {
        await navigator.share({ text })
        return
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return
      }
    }
    await navigator.clipboard.writeText(text)
    toast.success('Statement copied. Paste it in WhatsApp.')
  }

  function csv() {
    const body = statementCsv({ rows: exportRows(), a, b, name: realName })
    const slug = `${realName(a)}-${realName(b)}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    downloadBlob(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }), `evenly-${slug}-statement.csv`)
  }

  const settleFrom = ledger.balance > 0 ? b : a
  const settleTo = ledger.balance > 0 ? a : b

  return (
    <>
      <PageHeader title={`${an} & ${bn === 'You' ? 'you' : bn}`} subtitle={`${data.group.name} · statement`} backTo={`/groups/${id}`} />

      <div className="space-y-5 px-4 pt-2 lg:max-w-3xl">
        <Panel className="space-y-3">
          <p className="text-sm text-muted-foreground">Direct balance</p>
          <p
            className={cn(
              'text-2xl font-semibold tracking-tight',
              data.meId === a && ledger.balance > 0 && 'text-positive',
              data.meId === a && ledger.balance < 0 && 'text-negative',
            )}
          >
            {pairBalanceText(data, ledger.balance, a, b)}
          </p>
          <p className="text-sm text-muted-foreground">
            Worked out from {bills} {bills === 1 ? 'bill' : 'bills'} and {payments} {payments === 1 ? 'payment' : 'payments'} between {an === 'You' ? 'you' : an} and{' '}
            {bn === 'You' ? 'you' : bn}.{ledger.otherBills ? ` ${ledger.otherBills} other ${ledger.otherBills === 1 ? 'bill' : 'bills'} in the group didn't involve money between them.` : ''}
          </p>
          {data.group.simplifyDebts ? (
            <p className="rounded-xl bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
              This group simplifies debts, so the suggested payments on the group page can differ from this direct balance. Totals are the same either way.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {iAmIn && ledger.balance !== 0 ? (
              <Button className="h-11" onClick={() => openSettle({ groupId: id, from: settleFrom, to: settleTo, amount: Math.abs(ledger.balance) })}>
                <Handshake aria-hidden /> Settle {formatINR(Math.abs(ledger.balance))}
              </Button>
            ) : null}
            <Button variant="secondary" className="h-11" onClick={() => void share()}>
              <Share2 aria-hidden /> Share statement
            </Button>
            <Button variant="ghost" className="h-11" onClick={csv}>
              <Download aria-hidden /> CSV
            </Button>
          </div>
        </Panel>

        <div className="space-y-3">
          <Segmented<Kind>
            label="Show"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'all', label: 'All' },
              { value: 'bills', label: 'Bills' },
              { value: 'payments', label: 'Payments' },
            ]}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pair-month">Month</Label>
              <NativeSelect id="pair-month" value={month} onChange={(e) => setMonth(e.target.value)}>
                <option value="all">All time</option>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {formatMonthKey(m, true)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pair-search">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input id="pair-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Bill name" className="h-11 pl-9" />
              </div>
            </div>
          </div>
          <label className="flex min-h-11 items-center justify-between gap-3 rounded-xl border bg-card px-4 text-sm">
            <span>Show deleted and “not received” items</span>
            <Switch checked={showHidden} onCheckedChange={setShowHidden} />
          </label>
          {params.get('and') && data.meId && a !== data.meId && b !== data.meId ? (
            <button type="button" className="text-sm text-brand underline-offset-4 hover:underline" onClick={() => setParams({}, { replace: true })}>
              Show my statement with {bn} instead
            </button>
          ) : null}
        </div>

        <p className="px-1 text-xs text-muted-foreground">
          Newest first. <span className="font-medium">+</span> means {bn === 'You' ? 'you owe' : `${bn} owes`} {an === 'You' ? 'you' : an} more,{' '}
          <span className="font-medium">−</span> means less. Tap a row for details.
        </p>

        <PairRows data={data} rows={rows} a={a} b={b} />

        {filtered ? (
          <p className="px-1 pb-4 text-sm text-muted-foreground">Filters only hide rows. The balance after each row always counts everything before it.</p>
        ) : null}
      </div>
    </>
  )
}
