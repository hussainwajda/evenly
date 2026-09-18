import { UserPlus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Chip } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getOrCreatePerson } from '@/db/repo'
import { usePeople } from '@/hooks/useData'

export function Avatar({ name, className = 'size-6 text-[11px]' }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-secondary font-semibold text-secondary-foreground ${className}`} aria-hidden>
      {initials || '?'}
    </span>
  )
}

export function PeoplePicker({
  selected,
  onChange,
  single,
  label,
  error,
}: {
  selected: string[]
  onChange: (ids: string[]) => void
  single?: boolean
  label: string
  error?: string
}) {
  const allPeople = usePeople()
  const people = useMemo(() => allPeople.filter((p) => !p.archived || selected.includes(p.id)), [allPeople, selected])
  const [adding, setAdding] = useState('')

  function toggle(id: string) {
    if (single) onChange(selected[0] === id ? [] : [id])
    else onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  }

  async function add() {
    const name = adding.trim()
    if (!name) return
    const id = await getOrCreatePerson(name)
    setAdding('')
    if (single) onChange([id])
    else if (!selected.includes(id)) onChange([...selected, id])
  }

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      {people.length ? (
        <div className="flex flex-wrap gap-2">
          {people.map((p) => (
            <Chip key={p.id} selected={selected.includes(p.id)} onClick={() => toggle(p.id)} className="pl-1.5">
              <Avatar name={p.name} />
              {p.name}
            </Chip>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <Input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          placeholder={people.length ? 'Someone new…' : "Person's name"}
          aria-label="New person's name"
          autoComplete="off"
          enterKeyHint="done"
          className="h-11"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void add()
            }
          }}
        />
        <Button type="button" variant="secondary" className="h-11" onClick={() => void add()} disabled={!adding.trim()}>
          <UserPlus aria-hidden />
          Add
        </Button>
      </div>
      {error ? <p className="text-sm text-negative">{error}</p> : null}
    </fieldset>
  )
}
