import * as React from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { formatName, getCombinedRoster, type RosterUser } from '@/lib/api'

interface CidSearchProps {
  value: string
  onChange: (cid: string) => void
  onSubmit: (cid?: string) => void
}

export function CidSearch({ value, onChange, onSubmit }: CidSearchProps) {
  const [open, setOpen] = React.useState(false)
  const [roster, setRoster] = React.useState<RosterUser[]>([])
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open || roster.length > 0) return
    let cancelled = false
    getCombinedRoster()
      .then((users) => {
        if (cancelled) return
        const sorted = [...users].sort((a, b) =>
          formatName(a.fname, a.lname).toLowerCase().localeCompare(formatName(b.fname, b.lname).toLowerCase()),
        )
        setRoster(sorted)
      })
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [open, roster.length])

  const selected = React.useMemo(
    () => roster.find((u) => String(u.cid) === value),
    [roster, value],
  )
  const triggerLabel = selected
    ? `${formatName(selected.fname, selected.lname)} (CID ${selected.cid})`
    : value
      ? `CID ${value}`
      : 'Select or search by name…'

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className={cn('truncate', !selected && !value && 'text-muted-foreground')}>
              {triggerLabel}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command
            filter={(itemValue, search) => {
              return itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
            }}
          >
            <CommandInput placeholder="Search name or CID…" />
            <CommandList>
              <CommandEmpty>{error ? `Error: ${error}` : 'No matches.'}</CommandEmpty>
              <CommandGroup>
                {roster.map((u) => {
                  const display = formatName(u.fname, u.lname)
                  const itemValue = `${display} ${u.cid}`
                  return (
                    <CommandItem
                      key={u.cid}
                      value={itemValue}
                      onSelect={() => {
                        const picked = String(u.cid)
                        onChange(picked)
                        setOpen(false)
                        onSubmit(picked)
                      }}
                    >
                      <Check
                        className={cn(
                          'size-4',
                          String(u.cid) === value ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className="flex-1 truncate">{display}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {u.cid}
                        {u.rating ? ` • ${u.rating}` : ''}
                      </span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Button onClick={() => onSubmit()} disabled={!value}>
        Check Hours
      </Button>
    </div>
  )
}
