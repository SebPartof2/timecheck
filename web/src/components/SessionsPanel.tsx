import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowRight, ChevronDown, ChevronRight, GraduationCap, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  buildTimeline,
  groupSessions,
  type SessionDetail,
  type SessionGroup,
  type TimelineEntry,
} from '@/lib/calc'
import {
  formatNameFirstLast,
  getUserLookup,
  ratingShort,
  type Promotion,
  type RosterUser,
  type TrainingTicket,
  type UserLookup,
} from '@/lib/api'

function formatRange(group: SessionGroup): string {
  const start = group.earliestStart ? new Date(group.earliestStart) : null
  const end = group.latestEnd ? new Date(group.latestEnd) : null
  if (!start && !end) return ''
  if (group.count === 1) {
    return end ? end.toLocaleString() : start ? start.toLocaleString() : ''
  }
  if (!start) return end!.toLocaleString()
  if (!end) return start.toLocaleString()
  const sameDay = start.toDateString() === end.toDateString()
  if (sameDay) {
    return `${start.toLocaleDateString()} ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} → ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }
  return `${start.toLocaleString()} → ${end.toLocaleString()}`
}

const OTS_LABEL: Record<string, string> = {
  '1': 'OTS Pass',
  '2': 'OTS Fail',
  '3': 'Recommended',
}

const LOCATION_LABEL: Record<string, string> = {
  '0': 'Classroom',
  '1': 'Sweatbox',
  '2': 'Live',
}

interface TicketBadge {
  label: string
  tone: 'neutral' | 'good' | 'bad'
}

function ticketBadges(t: TrainingTicket): TicketBadge[] {
  const out: TicketBadge[] = []
  if (t.ots_status != null && OTS_LABEL[String(t.ots_status)]) {
    const status = String(t.ots_status)
    out.push({
      label: OTS_LABEL[status],
      tone: status === '2' ? 'bad' : status === '1' ? 'good' : 'neutral',
    })
  }
  if (t.location != null && LOCATION_LABEL[String(t.location)]) {
    out.push({ label: LOCATION_LABEL[String(t.location)], tone: 'neutral' })
  }
  if (t.is_cbt) out.push({ label: 'CBT', tone: 'neutral' })
  if (t.solo_granted) out.push({ label: 'Solo granted', tone: 'good' })
  if (typeof t.score === 'number' && t.score > 0) {
    out.push({ label: `Score ${t.score}/5`, tone: 'neutral' })
  }
  return out
}

const TONE_CLASSES: Record<TicketBadge['tone'], string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  good: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500',
  bad: 'border-destructive/40 bg-destructive/10 text-destructive',
}

function GroupRow({ group }: { group: SessionGroup }) {
  const [open, setOpen] = React.useState(false)
  const Icon = open ? ChevronDown : ChevronRight

  return (
    <>
      <TableRow
        className={cn(
          'cursor-pointer',
          group.isTraining && 'bg-amber-500/5 hover:bg-amber-500/10',
          open && (group.isTraining ? 'bg-amber-500/10' : 'bg-muted/40'),
        )}
        onClick={() => setOpen((v) => !v)}
      >
        <TableCell className="w-8 pr-0">
          <Icon
            className={cn(
              'size-4',
              group.isTraining ? 'text-amber-500/80' : 'text-muted-foreground',
            )}
          />
        </TableCell>
        <TableCell className="font-medium">
          <div className="flex items-center gap-2">
            <span className={cn(group.isTraining && 'text-amber-500/90')}>{group.facility}</span>
            {group.isTraining && (
              <span className="rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-500">
                Training
              </span>
            )}
          </div>
        </TableCell>
        <TableCell className="text-right tabular-nums">{group.count}</TableCell>
        <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
          {formatRange(group)}
        </TableCell>
        <TableCell className="text-right tabular-nums">{group.hours.toFixed(1)}</TableCell>
        <TableCell className="text-right tabular-nums">{group.tracked}</TableCell>
      </TableRow>
      {open && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={6} className="p-0">
            <div className="bg-muted/20 border-y">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b-muted/40">
                    <TableHead className="pl-12 h-9">Callsign</TableHead>
                    <TableHead className="h-9">Rating</TableHead>
                    <TableHead className="h-9">Start</TableHead>
                    <TableHead className="h-9">End</TableHead>
                    <TableHead className="h-9 text-right">Hours</TableHead>
                    <TableHead className="h-9 text-right">Tracked</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.sessions.map((s, i) => (
                    <TableRow key={i} className="hover:bg-transparent">
                      <TableCell className="pl-12 py-2">{s.callsign}</TableCell>
                      <TableCell className="py-2">{s.rating ?? ''}</TableCell>
                      <TableCell className="py-2 text-xs whitespace-nowrap">
                        {s.start ? new Date(s.start).toLocaleString() : ''}
                      </TableCell>
                      <TableCell className="py-2 text-xs whitespace-nowrap">
                        {s.end ? new Date(s.end).toLocaleString() : ''}
                      </TableCell>
                      <TableCell className="py-2 text-right tabular-nums">{s.hours.toFixed(1)}</TableCell>
                      <TableCell className="py-2 text-right tabular-nums">{s.tracked}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function instructorFromRoster(
  roster: RosterUser[],
  cid: number | string | undefined,
): string | null {
  if (cid == null || cid === '') return null
  const found = roster.find((u) => String(u.cid) === String(cid))
  if (!found) return null
  return formatNameFirstLast(found.fname, found.lname) || String(cid)
}

function TicketRow({
  ticket,
  durationHours,
  roster,
  homeFacility,
}: {
  ticket: TrainingTicket
  durationHours: number
  roster: RosterUser[]
  homeFacility: string
}) {
  const [open, setOpen] = React.useState(false)
  const [vatusa, setVatusa] = React.useState<UserLookup | null>(null)
  const Icon = open ? ChevronDown : ChevronRight
  const badges = ticketBadges(ticket)
  const date = ticket.session_date ? new Date(ticket.session_date) : null
  const hasNotes = !!(ticket.notes && String(ticket.notes).trim())
  const expandable = hasNotes

  const rosterName = instructorFromRoster(roster, ticket.instructor_id)
  React.useEffect(() => {
    if (rosterName != null) return
    const cid = ticket.instructor_id
    if (cid == null || cid === '') return
    let cancelled = false
    getUserLookup(String(cid)).then((u) => {
      if (!cancelled) setVatusa(u)
    })
    return () => {
      cancelled = true
    }
  }, [rosterName, ticket.instructor_id])

  const instructor =
    rosterName ??
    (vatusa
      ? formatNameFirstLast(vatusa.fname, vatusa.lname) || String(ticket.instructor_id ?? '')
      : ticket.instructor_id != null
        ? String(ticket.instructor_id)
        : '')

  const ticketFacility = (ticket.facility_id || '').toString().toUpperCase()
  const homeFacilityUpper = (homeFacility || '').toUpperCase()
  const showFacility = !!ticketFacility && ticketFacility !== homeFacilityUpper

  return (
    <>
      <TableRow
        className={cn(
          'bg-blue-500/5 hover:bg-blue-500/10',
          expandable && 'cursor-pointer',
          open && 'bg-blue-500/10',
        )}
        onClick={expandable ? () => setOpen((v) => !v) : undefined}
      >
        <TableCell className="w-8 pr-0">
          {expandable ? (
            <Icon className="size-4 text-blue-500/80" />
          ) : (
            <GraduationCap className="size-4 text-blue-500/80" />
          )}
        </TableCell>
        <TableCell className="font-medium">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-blue-500/90">
              {ticket.position || 'Training Ticket'}
              {showFacility && (
                <span className="ml-1 text-muted-foreground font-normal">({ticketFacility})</span>
              )}
            </span>
            <span className="rounded-md border border-blue-500/40 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-blue-500">
              Ticket
            </span>
            {badges.map((b) => (
              <span
                key={b.label}
                className={cn(
                  'rounded-md border px-1.5 py-0.5 text-[10px] font-medium',
                  TONE_CLASSES[b.tone],
                )}
              >
                {b.label}
              </span>
            ))}
          </div>
        </TableCell>
        <TableCell className="text-right whitespace-nowrap text-xs">
          {instructor ? (
            <span className="font-medium">{instructor}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
          {date ? date.toLocaleString() : ''}
        </TableCell>
        <TableCell className="text-right tabular-nums">{durationHours.toFixed(1)}</TableCell>
        <TableCell className="text-right tabular-nums">
          {typeof ticket.movements === 'number' && ticket.movements > 0 ? (
            ticket.movements
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </TableCell>
      </TableRow>
      {open && hasNotes && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={6} className="p-0">
            <div className="bg-blue-500/5 border-y px-6 py-3 text-sm">
              <div className="text-xs uppercase tracking-wider text-blue-500/80 mb-1">
                Instructor notes
              </div>
              <div
                className="ticket-notes max-w-none"
                dangerouslySetInnerHTML={{ __html: String(ticket.notes ?? '') }}
              />
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

function PromotionRow({ promotion, roster }: { promotion: Promotion; roster: RosterUser[] }) {
  const from = promotion.from
  const to = promotion.to
  const isPromotion = from != null && to != null && to > from
  const isDemotion = from != null && to != null && to < from
  const Icon = isDemotion ? TrendingDown : TrendingUp
  const tone = isDemotion ? 'rose' : 'emerald'
  const label = isDemotion ? 'Demotion' : isPromotion ? 'Promotion' : 'Rating change'

  const grantorRoster = instructorFromRoster(roster, promotion.grantor)
  const examinerRoster = instructorFromRoster(roster, promotion.examiner)
  const [grantorVatusa, setGrantorVatusa] = React.useState<UserLookup | null>(null)
  const [examinerVatusa, setExaminerVatusa] = React.useState<UserLookup | null>(null)

  React.useEffect(() => {
    if (grantorRoster != null || promotion.grantor == null) return
    let cancelled = false
    getUserLookup(String(promotion.grantor)).then((u) => {
      if (!cancelled) setGrantorVatusa(u)
    })
    return () => {
      cancelled = true
    }
  }, [grantorRoster, promotion.grantor])

  React.useEffect(() => {
    if (
      examinerRoster != null ||
      promotion.examiner == null ||
      String(promotion.examiner) === String(promotion.grantor)
    )
      return
    let cancelled = false
    getUserLookup(String(promotion.examiner)).then((u) => {
      if (!cancelled) setExaminerVatusa(u)
    })
    return () => {
      cancelled = true
    }
  }, [examinerRoster, promotion.examiner, promotion.grantor])

  const grantor =
    grantorRoster ??
    (grantorVatusa
      ? formatNameFirstLast(grantorVatusa.fname, grantorVatusa.lname) || String(promotion.grantor ?? '')
      : promotion.grantor != null
        ? String(promotion.grantor)
        : '')

  const examiner =
    examinerRoster ??
    (examinerVatusa
      ? formatNameFirstLast(examinerVatusa.fname, examinerVatusa.lname) || String(promotion.examiner ?? '')
      : promotion.examiner != null
        ? String(promotion.examiner)
        : '')

  const date = promotion.created_at ? new Date(promotion.created_at) : null

  const toneClasses =
    tone === 'rose'
      ? 'bg-rose-500/5 hover:bg-rose-500/10 text-rose-500/90'
      : 'bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-500/90'
  const iconClass = tone === 'rose' ? 'text-rose-500/80' : 'text-emerald-500/80'
  const badgeClass =
    tone === 'rose'
      ? 'border-rose-500/40 bg-rose-500/10 text-rose-500'
      : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'

  return (
    <TableRow className={cn(toneClasses)}>
      <TableCell className="w-8 pr-0">
        <Icon className={cn('size-4', iconClass)} />
      </TableCell>
      <TableCell className="font-medium">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="font-mono text-xs text-muted-foreground">{ratingShort(from)}</span>
            <ArrowRight className={cn('size-3', iconClass)} />
            <span className="font-mono text-sm font-semibold">{ratingShort(to)}</span>
          </span>
          {promotion.position && (
            <span className="text-xs text-muted-foreground">on {promotion.position}</span>
          )}
          <span
            className={cn(
              'rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider',
              badgeClass,
            )}
          >
            {label}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-right whitespace-nowrap text-xs">
        {grantor ? <span className="font-medium">{grantor}</span> : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
        {date ? date.toLocaleString() : ''}
      </TableCell>
      <TableCell className="text-right text-xs whitespace-nowrap">
        {examiner && examiner !== grantor ? (
          <span title="Examiner">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">EX</span>
            {examiner}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">
        {promotion.exam ? String(promotion.exam) : '—'}
      </TableCell>
    </TableRow>
  )
}

export function SessionsPanel({
  sessions,
  tickets,
  promotions = [],
  roster = [],
  homeFacility = '',
}: {
  sessions: SessionDetail[]
  tickets: TrainingTicket[]
  promotions?: Promotion[]
  roster?: RosterUser[]
  homeFacility?: string
}) {
  const [open, setOpen] = React.useState(true)
  const entries: TimelineEntry[] = React.useMemo(() => {
    const groups = groupSessions(sessions)
    return buildTimeline(groups, tickets, promotions)
  }, [sessions, tickets, promotions])

  const ticketCount = entries.filter((e) => e.kind === 'ticket').length
  const promotionCount = entries.filter((e) => e.kind === 'promotion').length
  const groupCount = entries.length - ticketCount - promotionCount

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b px-6 py-3">
          <p className="text-sm text-muted-foreground">
            {groupCount} session group{groupCount !== 1 ? 's' : ''}
            {ticketCount > 0 && ` · ${ticketCount} training ticket${ticketCount !== 1 ? 's' : ''}`}
            {promotionCount > 0 &&
              ` · ${promotionCount} rating change${promotionCount !== 1 ? 's' : ''}`}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            {open ? 'Hide timeline' : 'Show timeline'}
          </Button>
        </div>
        {open && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 pr-0"></TableHead>
                <TableHead>Facility / position</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Tracked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e, i) =>
                e.kind === 'group' ? (
                  <GroupRow key={`g-${i}`} group={e.group} />
                ) : e.kind === 'ticket' ? (
                  <TicketRow
                    key={`t-${i}`}
                    ticket={e.ticket}
                    durationHours={e.durationHours}
                    roster={roster}
                    homeFacility={homeFacility}
                  />
                ) : (
                  <PromotionRow key={`p-${i}`} promotion={e.promotion} roster={roster} />
                ),
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
