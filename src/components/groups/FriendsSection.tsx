import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { Section } from '@/components/common'
import { Avatar } from '@/components/PeoplePicker'
import { type Friend, useFriends } from '@/hooks/useGroups'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'

export function FriendAvatar({ friend, className = 'size-10 text-sm' }: { friend: Pick<Friend, 'name' | 'avatarUrl'>; className?: string }) {
  return friend.avatarUrl ? (
    <img src={friend.avatarUrl} alt="" referrerPolicy="no-referrer" className={cn('shrink-0 rounded-full object-cover', className)} />
  ) : (
    <Avatar name={friend.name} className={className} />
  )
}

/** People I share groups with, and what we owe each other across all of them. */
export function FriendsSection() {
  const friends = useFriends()
  if (!friends?.length) return null
  return (
    <Section title="Friends in groups">
      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        {friends.map((f) => (
          <li key={f.userId}>
            <Link to={`/friends/${f.userId}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40 active:bg-accent/60">
              <FriendAvatar friend={f} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{f.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {f.groups.length === 1 ? f.groups[0].groupName : `${f.groups.length} shared groups`}
                </p>
              </div>
              <span className={cn('money shrink-0 text-sm font-semibold', f.total > 0 ? 'text-positive' : f.total < 0 ? 'text-negative' : 'text-muted-foreground')}>
                {f.total === 0 ? 'settled' : f.total > 0 ? `owes you ${formatINR(f.total)}` : `you owe ${formatINR(-f.total)}`}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  )
}
