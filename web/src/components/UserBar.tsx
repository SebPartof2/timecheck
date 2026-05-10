import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogOut, ShieldCheck, IdCard, Award } from 'lucide-react'
import type { CurrentUser } from '@/lib/api'

function initials(user: CurrentUser | null): string {
  if (!user) return '?'
  const f = (user.fname || '').trim()[0] || ''
  const l = (user.lname || '').trim()[0] || ''
  const both = `${f}${l}`.toUpperCase()
  if (both) return both
  if (user.cid) return user.cid.slice(0, 2)
  return 'U'
}

export function UserBar({ user }: { user: CurrentUser | null }) {
  const firstName = user?.fname?.trim() || ''

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="size-10 rounded-full p-0 hover:bg-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          disabled={!user}
        >
          <Avatar className="size-10 ring-2 ring-primary/40 ring-offset-2 ring-offset-background transition hover:ring-primary/70">
            <AvatarFallback className="text-sm">{initials(user)}</AvatarFallback>
          </Avatar>
          <span className="sr-only">Open profile menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {firstName && <DropdownMenuLabel className="py-2">{firstName}</DropdownMenuLabel>}
        {firstName && <DropdownMenuSeparator />}
        {user?.cid && (
          <DropdownMenuItem disabled className="opacity-100">
            <IdCard className="text-muted-foreground" />
            <span className="text-muted-foreground">CID</span>
            <span className="ml-auto font-mono text-xs">{user.cid}</span>
          </DropdownMenuItem>
        )}
        {user?.rating && (
          <DropdownMenuItem disabled className="opacity-100">
            <Award className="text-muted-foreground" />
            <span className="text-muted-foreground">Rating</span>
            <span className="ml-auto text-xs">{user.rating}</span>
          </DropdownMenuItem>
        )}
        {user?.roles?.length ? (
          <DropdownMenuItem disabled className="opacity-100">
            <ShieldCheck className="text-muted-foreground" />
            <span className="text-muted-foreground">Roles</span>
            <span className="ml-auto truncate text-xs">{user.roles.join(', ')}</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/auth/logout" className="cursor-pointer">
            <LogOut />
            Sign out
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
