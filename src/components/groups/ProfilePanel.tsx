import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Panel, Section } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { groupsApi, runSync, useSyncStore } from '@/sync/controller'

const UPI_RE = /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,64}$/

/** Name and UPI ID that group members see (so they know who you are and how to pay you back). */
export function ProfilePanel() {
  const user = useSyncStore((s) => s.user)
  const [name, setName] = useState('')
  const [upi, setUpi] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [upiError, setUpiError] = useState<string>()

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const api = await groupsApi()
        const p = await api.getMyProfile()
        if (cancelled) return
        setName(p?.displayName || user?.name || '')
        setUpi(p?.upiId ?? '')
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load your profile')
          setName(user?.name ?? '')
        }
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, user?.name])

  async function save() {
    const cleanUpi = upi.trim()
    if (cleanUpi && !UPI_RE.test(cleanUpi)) {
      setUpiError("That doesn't look like a UPI ID (example: name@okaxis)")
      return
    }
    setBusy(true)
    try {
      const api = await groupsApi()
      await api.saveMyProfile({ displayName: name.trim() || user?.name || 'Me', upiId: cleanUpi || null })
      setError(null)
      toast.success('Profile saved')
      void runSync()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section title="Profile for shared groups">
      <Panel>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Name</Label>
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="h-11" disabled={!loaded} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="profile-upi">UPI ID</Label>
            <Input
              id="profile-upi"
              value={upi}
              onChange={(e) => {
                setUpi(e.target.value)
                setUpiError(undefined)
              }}
              placeholder="yourname@okaxis"
              autoComplete="off"
              autoCapitalize="none"
              className="h-11"
              disabled={!loaded}
              aria-invalid={Boolean(upiError)}
              aria-describedby="profile-upi-hint"
            />
            <p id="profile-upi-hint" className={upiError ? 'text-sm text-negative' : 'text-xs text-muted-foreground'}>
              {upiError ?? 'Group members see this, so they can copy it and pay you back.'}
            </p>
          </div>
          {error ? <p className="text-sm text-negative">{error}</p> : null}
          <Button type="submit" className="h-11" disabled={busy || !loaded}>
            {busy ? 'Saving…' : 'Save profile'}
          </Button>
        </form>
      </Panel>
    </Section>
  )
}
