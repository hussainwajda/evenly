import { Copy, Share2, UserPlus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Section } from '@/components/common'
import { FormSheet } from '@/components/FormParts'
import { Avatar } from '@/components/PeoplePicker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { GroupData } from '@/hooks/useGroups'
import { groupsApi, runSync } from '@/sync/controller'

export function InviteSheet({ open, onOpenChange, data }: { open: boolean; onOpenChange: (open: boolean) => void; data: GroupData }) {
  const [link, setLink] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || link) return
    let cancelled = false
    setError(null)
    void (async () => {
      try {
        const api = await groupsApi()
        const token = await api.createInvite(data.group.id, 30)
        const url = `${window.location.origin}/join/${token}`
        if (cancelled) return
        setLink(url)
        const QRCode = (await import('qrcode')).default
        const image = await QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: '#0f172a', light: '#ffffff' } })
        if (!cancelled) setQr(image)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not create an invite link')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, link, data.group.id])

  const message = link ? `Join "${data.group.name}" on Evenly to split expenses: ${link}` : ''

  async function addPlaceholder() {
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    try {
      const api = await groupsApi()
      await api.addPlaceholder(data.group.id, name)
      setNewName('')
      await runSync()
      toast.success(`Added ${name}. They can claim their name when they join.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add them')
    } finally {
      setBusy(false)
    }
  }

  async function removePlaceholder(memberId: string, name: string) {
    try {
      const api = await groupsApi()
      await api.removeMember(memberId)
      await runSync()
      toast(`Removed ${name}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove them')
    }
  }

  return (
    <FormSheet open={open} onOpenChange={onOpenChange} title="Invite people" description={data.group.name}>
      <div className="space-y-6">
        {error ? (
          <p className="rounded-xl bg-muted/60 px-3 py-2.5 text-sm text-negative" role="alert">
            {error}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-xl border bg-card p-3">
              <p className="min-w-0 flex-1 truncate text-sm" aria-live="polite">
                {link ?? 'Creating link…'}
              </p>
              <Button
                type="button"
                variant="secondary"
                className="h-11"
                disabled={!link}
                onClick={async () => {
                  await navigator.clipboard.writeText(link!)
                  toast.success('Invite link copied')
                }}
              >
                <Copy aria-hidden /> Copy
              </Button>
            </div>
            {typeof navigator.share === 'function' ? (
              <Button className="h-12 w-full" disabled={!link} onClick={() => void navigator.share({ text: message }).catch(() => {})}>
                <Share2 aria-hidden /> Share on WhatsApp, Telegram…
              </Button>
            ) : (
              <Button asChild className="h-12 w-full" disabled={!link}>
                <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
                  <Share2 aria-hidden /> Share on WhatsApp
                </a>
              </Button>
            )}
            {qr ? (
              <figure className="flex flex-col items-center gap-2">
                <img src={qr} alt={`QR code for the invite link to ${data.group.name}`} className="size-48 rounded-xl bg-white p-2" />
                <figcaption className="text-xs text-muted-foreground">Or let them scan this with their phone camera</figcaption>
              </figure>
            ) : null}
            <p className="text-xs text-muted-foreground">
              The link works for 30 days. People sign in with Google, then join. Only group members can see its expenses.
            </p>
          </div>
        )}

        <Section title="Add someone who hasn't joined yet">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void addPlaceholder()
            }}
          >
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Their name" aria-label="Name" className="h-11" maxLength={60} />
            <Button type="submit" variant="secondary" className="h-11" disabled={busy || !newName.trim()}>
              <UserPlus aria-hidden /> Add
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">You can split with them right away. When they open the link, they pick their name and see everything.</p>
        </Section>

        <Section title={`People (${data.activeMembers.length})`}>
          <ul className="divide-y rounded-2xl border bg-card">
            {data.activeMembers.map((m) => (
              <li key={m.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
                <Avatar name={m.displayName} className="size-8 text-xs" />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {m.displayName}
                  {m.id === data.meId ? ' (you)' : ''}
                </span>
                {m.userId ? null : <Badge variant="secondary">Not joined yet</Badge>}
                {m.userId ? null : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11 rounded-full"
                    aria-label={`Remove ${m.displayName}`}
                    onClick={() => void removePlaceholder(m.id, m.displayName)}
                  >
                    <X aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </FormSheet>
  )
}
