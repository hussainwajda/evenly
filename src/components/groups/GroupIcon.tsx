import { Briefcase, Heart, House, type LucideIcon, Plane, Users, UsersRound } from 'lucide-react'
import type { GroupKind } from '@/lib/groupTypes'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'

export const GROUP_KINDS: { value: GroupKind; label: string; icon: LucideIcon }[] = [
  { value: 'home', label: 'Home', icon: House },
  { value: 'trip', label: 'Trip', icon: Plane },
  { value: 'couple', label: 'Couple', icon: Heart },
  { value: 'friends', label: 'Friends', icon: Users },
  { value: 'work', label: 'Work', icon: Briefcase },
  { value: 'other', label: 'Other', icon: UsersRound },
]

export function GroupIcon({ kind, className }: { kind: GroupKind; className?: string }) {
  const Icon = GROUP_KINDS.find((k) => k.value === kind)?.icon ?? UsersRound
  return (
    <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand', className)} aria-hidden>
      <Icon className="size-5" />
    </span>
  )
}

/** "you're owed ₹840" / "you owe ₹200" / "settled up" — text plus colour, never colour alone. */
export function NetText({ net, className }: { net: number; className?: string }) {
  if (net > 0) {
    return (
      <span className={cn('text-positive', className)}>
        you're owed <span className="money font-semibold">{formatINR(net)}</span>
      </span>
    )
  }
  if (net < 0) {
    return (
      <span className={cn('text-negative', className)}>
        you owe <span className="money font-semibold">{formatINR(-net)}</span>
      </span>
    )
  }
  return <span className={cn('text-muted-foreground', className)}>settled up</span>
}
