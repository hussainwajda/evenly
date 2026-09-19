import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, ArchiveRestore, ArrowDownLeft, ArrowUpRight, ChevronRight, Handshake, MessageCircle, MoreVertical, Pencil, Users, UserX } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyState, PageHeader, Panel, Section } from '@/components/common'
import { FormSheet } from '@/components/FormParts'
import { Avatar } from '@/components/PeoplePicker'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { db } from '@/db'
import { savePerson, setPersonArchived } from '@/db/repo'
import { formatShortDate } from '@/lib/dates'
import { LEDGER_LABEL, LEDGER_SIGN, personBalance } from '@/lib/ledger'
import { formatINR } from '@/lib/money'
import type { LedgerType, Transaction } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useUi } from '@/stores/ui'

export function PersonPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const openLedger = useUi((s) => s.openLedger)
  const openExpense = useUi((s) => s.openExpense)
  const person = useLiveQuery(async () => (await db.people.get(id)) ?? null, [id])
  const entries = useLiveQuery(() => db.ledger.where('personId').equals(id).toArray(), [id], [])
  const live = entries.filter((e) => !e.deletedAt).sort((a, b) => b.occurredAt - a.occurredAt)
  const txnIds = [...new Set(live.map((e) => e.transactionId).filter((x): x is string => Boolean(x)))]
  const linked = useLiveQuery(() => db.transactions.bulkGet(txnIds), [txnIds.join(',')], [])
  const linkedMap = new Map<string, Transaction>()
  for (const t of linked) if (t) linkedMap.set(t.id, t)
  const [editing, setEditing] = useState(false)

  if (person === undefined) return <PageHeader title="" backTo="/people" />
  if (person === null) {
    return (
      <>
        <PageHeader title="Not found" backTo="/people" />
        <EmptyState icon={UserX} title="This person doesn't exist" action={<Button onClick={() => navigate('/people')}>Back to People</Button>} />
      </>
    )
  }

  const balance = personBalance(live)

  async function remind() {
    if (!person) return
    const text =
      balance > 0
        ? `Hi ${person.name}, a gentle reminder about the ${formatINR(balance)} pending. Thanks!`
        : `Hi ${person.name}, I owe you ${formatINR(-balance)}. Will settle soon.`
    if (navigator.share) {
      try {
        await navigator.share({ text })
        return
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return
      }
    }
    const digits = person.phone.replace(/\D/g, '')
    const phone = digits.length === 10 ? `91${digits}` : digits
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  }

  const quick: { type: LedgerType; label: string }[] = [
    { type: 'lent', label: 'I lent' },
    { type: 'borrowed', label: 'I borrowed' },
    { type: 'received', label: 'Got back' },
    { type: 'repaid', label: 'Paid back' },
  ]

  return (
    <>
      <PageHeader
        title={person.name}
        subtitle={person.archived ? 'Archived' : undefined}
        backTo="/people"
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-11 rounded-full" aria-label="More actions">
                <MoreVertical className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem className="min-h-11" onSelect={() => setEditing(true)}>
                <Pencil aria-hidden /> Edit name & phone
              </DropdownMenuItem>
              <DropdownMenuItem
                className="min-h-11"
                onSelect={async () => {
                  await setPersonArchived(person.id, !person.archived)
                  toast(person.archived ? `${person.name} restored` : `${person.name} archived`)
                }}
              >
                {person.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
                {person.archived ? 'Restore' : 'Archive'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="space-y-6 px-4 pt-2 lg:max-w-3xl">
        {person.linkedUserId ? (
          <Link
            to={`/friends/${person.linkedUserId}`}
            className="flex min-h-12 items-center gap-2 rounded-2xl border bg-card px-4 py-2 text-sm transition-colors hover:bg-accent/40 active:bg-accent/60"
          >
            <Users className="size-4 text-brand" aria-hidden />
            <span className="min-w-0 flex-1">Also in your shared groups. See everything between you, including groups.</span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        ) : null}
        <Panel className="space-y-4 text-center">
          <Avatar name={person.name} className="mx-auto size-16 text-xl" />
          <div>
            <p className="text-sm text-muted-foreground">{balance > 0 ? `${person.name} owes you` : balance < 0 ? `You owe ${person.name}` : 'All settled'}</p>
            <p className={cn('text-4xl font-semibold tracking-tight', balance > 0 ? 'text-positive' : balance < 0 ? 'text-negative' : undefined)}>
              {formatINR(Math.abs(balance))}
            </p>
          </div>
          {balance !== 0 ? (
            <div className="grid grid-cols-2 gap-2">
              <Button
                className="h-12"
                onClick={() => openLedger({ personId: person.id, type: balance > 0 ? 'received' : 'repaid', amount: Math.abs(balance) })}
              >
                <Handshake aria-hidden /> Settle up
              </Button>
              <Button variant="secondary" className="h-12" onClick={() => void remind()}>
                <MessageCircle aria-hidden /> Remind
              </Button>
            </div>
          ) : null}
        </Panel>

        <div className="grid grid-cols-4 gap-2">
          {quick.map((q) => (
            <Button key={q.type} variant="outline" className="h-12 px-1 text-xs" onClick={() => openLedger({ personId: person.id, type: q.type })}>
              {q.label}
            </Button>
          ))}
        </div>

        <Section title="History">
          {live.length === 0 ? (
            <Panel>
              <p className="text-center text-sm text-muted-foreground">No entries yet.</p>
            </Panel>
          ) : (
            <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
              {live.map((e) => {
                const sign = LEDGER_SIGN[e.type]
                const txn = e.transactionId ? linkedMap.get(e.transactionId) : undefined
                const outgoing = e.type === 'lent' || e.type === 'repaid'
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-accent/60"
                      onClick={() => (e.transactionId ? openExpense({ editId: e.transactionId }) : openLedger({ editId: e.id }))}
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                        {outgoing ? <ArrowUpRight className="size-5" aria-hidden /> : <ArrowDownLeft className="size-5" aria-hidden />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{LEDGER_LABEL[e.type]}</p>
                        <p className="truncate text-sm text-muted-foreground">
                          {[txn ? txn.name : e.note, formatShortDate(e.occurredAt)].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <span className={cn('money shrink-0 font-semibold', sign > 0 ? 'text-positive' : 'text-negative')}>
                        {sign > 0 ? '+' : '−'}
                        {formatINR(e.amount)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="px-1 text-xs text-muted-foreground">+ means {person.name} owes you more · − means you owe them more</p>
        </Section>
      </div>

      <EditPersonSheet open={editing} onOpenChange={setEditing} person={person} />
    </>
  )
}

function EditPersonSheet({
  open,
  onOpenChange,
  person,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  person: { id: string; name: string; phone: string }
}) {
  const [name, setName] = useState(person.name)
  const [phone, setPhone] = useState(person.phone)
  return (
    <FormSheet
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setName(person.name)
          setPhone(person.phone)
        }
        onOpenChange(o)
      }}
      title="Edit person"
      footer={
        <Button type="submit" form="person-form" className="h-12 flex-1 text-base">
          Save
        </Button>
      }
    >
      <form
        id="person-form"
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          await savePerson({ name, phone }, person.id)
          onOpenChange(false)
          toast.success('Saved')
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="person-name">Name</Label>
          <Input id="person-name" value={name} onChange={(e) => setName(e.target.value)} className="h-12" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="person-phone">WhatsApp number (optional)</Label>
          <Input id="person-phone" type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-12" placeholder="10-digit mobile number" />
          <p className="text-xs text-muted-foreground">Used only to open WhatsApp when you tap Remind.</p>
        </div>
      </form>
    </FormSheet>
  )
}
