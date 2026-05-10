import type { ATCSession, Facility, FacilityConfig, Promotion, TrainingTicket } from './api'

export interface FacilityResult {
  name: string
  short: string
  sessions: number
  hours: number
  tracked: number
}

export interface SessionDetail {
  facility: string
  isTraining: boolean
  callsign: string
  rating: number | string | null
  start: string
  end: string
  hours: number
  tracked: number
}

export interface SessionGroup {
  facility: string
  isTraining: boolean
  sessions: SessionDetail[]
  count: number
  hours: number
  tracked: number
  earliestStart: string
  latestEnd: string
}

export function parseDurationToHours(d: string | number | undefined | null): number {
  if (d == null) return 0
  if (typeof d === 'number') {
    return d > 1000 ? d / 3600 : d
  }
  const s = String(d).trim()
  if (!s) return 0
  if (s.includes(':')) {
    const parts = s.split(':').map((x) => Number(x) || 0)
    if (parts.length === 3) return parts[0] + parts[1] / 60 + parts[2] / 3600
    if (parts.length === 2) return parts[0] + parts[1] / 60
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

export type TimelineEntry =
  | { kind: 'group'; group: SessionGroup; sortDate: number }
  | { kind: 'ticket'; ticket: TrainingTicket; durationHours: number; sortDate: number }
  | { kind: 'promotion'; promotion: Promotion; sortDate: number }

export function buildTimeline(
  groups: SessionGroup[],
  tickets: TrainingTicket[],
  promotions: Promotion[] = [],
): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  for (const g of groups) {
    const ref = g.latestEnd || g.earliestStart
    const sortDate = ref ? new Date(ref).getTime() : 0
    entries.push({ kind: 'group', group: g, sortDate })
  }
  for (const t of tickets) {
    const ref = t.session_date
    const sortDate = ref ? new Date(ref).getTime() : 0
    entries.push({
      kind: 'ticket',
      ticket: t,
      durationHours: parseDurationToHours(t.duration),
      sortDate,
    })
  }
  for (const p of promotions) {
    const ref = p.created_at
    const sortDate = ref ? new Date(ref).getTime() : 0
    entries.push({ kind: 'promotion', promotion: p, sortDate })
  }
  entries.sort((a, b) => b.sortDate - a.sortDate)
  return entries
}

export function groupSessions(sessions: SessionDetail[]): SessionGroup[] {
  const groups: SessionGroup[] = []
  for (const s of sessions) {
    const last = groups[groups.length - 1]
    if (last && last.facility === s.facility && last.isTraining === s.isTraining) {
      last.sessions.push(s)
      last.count++
      last.hours += s.hours
      last.tracked += s.tracked
      if (s.start && (!last.earliestStart || new Date(s.start).getTime() < new Date(last.earliestStart).getTime())) {
        last.earliestStart = s.start
      }
      if (s.end && (!last.latestEnd || new Date(s.end).getTime() > new Date(last.latestEnd).getTime())) {
        last.latestEnd = s.end
      }
    } else {
      groups.push({
        facility: s.facility,
        isTraining: s.isTraining,
        sessions: [s],
        count: 1,
        hours: s.hours,
        tracked: s.tracked,
        earliestStart: s.start,
        latestEnd: s.end,
      })
    }
  }
  return groups
}

export interface CompiledFacility extends Facility {
  regex: RegExp
}

export interface CompiledConfig {
  artccPrefixes: string[]
  facilities: CompiledFacility[]
  homeFacility: string
}

export function compileFacilities(config: FacilityConfig): CompiledConfig {
  return {
    artccPrefixes: (config.artccPrefixes || []).map((p) => p.toUpperCase()),
    facilities: (config.facilities || []).map((f) => ({ ...f, regex: new RegExp(f.pattern) })),
    homeFacility: (config.homeFacility || '').toUpperCase(),
  }
}

function callsignInArtcc(callsign: string, prefixes: string[]): boolean {
  if (prefixes.length === 0) return true
  const upper = callsign.toUpperCase()
  return prefixes.some((p) => upper.startsWith(`${p}_`) || upper === p)
}

export interface HoursResult {
  facilityResults: FacilityResult[]
  unmatched: FacilityResult
  training: FacilityResult
  sessionDetails: SessionDetail[]
}

export function calculateHours(
  sessions: ATCSession[],
  config: CompiledConfig,
  startDate: string | null = null,
  endDate: string | null = null,
): HoursResult {
  const { artccPrefixes, facilities } = config
  const results: FacilityResult[] = facilities.map((f) => ({
    name: f.name,
    short: f.short,
    sessions: 0,
    hours: 0,
    tracked: 0,
  }))
  const unmatched: FacilityResult = {
    name: 'Other — Outside ARTCC',
    short: 'Outside ARTCC',
    sessions: 0,
    hours: 0,
    tracked: 0,
  }
  const training: FacilityResult = {
    name: 'Training (under rating)',
    short: 'Training',
    sessions: 0,
    hours: 0,
    tracked: 0,
  }
  const sessionDetails: SessionDetail[] = []

  const startTime = startDate ? new Date(startDate).getTime() : null
  const endTime = endDate ? new Date(endDate).getTime() : null

  for (const session of sessions) {
    const data = session.connection_id || (session as ATCSession & { start?: string; end?: string })
    const callsign = (data as { callsign?: string }).callsign || session.callsign || ''
    const ratingRaw = (data as { rating?: number | string }).rating ?? session.rating
    const tracked = session.aircrafttracked != null ? session.aircrafttracked : 0

    const sessionStart = (data as { start?: string }).start ? new Date((data as { start?: string }).start!).getTime() : null
    const sessionEnd = (data as { end?: string }).end ? new Date((data as { end?: string }).end!).getTime() : null

    if (startTime && sessionEnd && sessionEnd < startTime) continue
    if (endTime && sessionStart && sessionStart > endTime) continue

    const startStr = (data as { start?: string }).start
    const endStr = (data as { end?: string }).end
    const hours = session.minutes_on_callsign != null
      ? session.minutes_on_callsign / 60
      : startStr && endStr
        ? (new Date(endStr).getTime() - new Date(startStr).getTime()) / 3600000
        : 0

    let facilityName = unmatched.name
    let isTraining = false
    let bucketed = false
    if (callsignInArtcc(callsign, artccPrefixes)) {
      for (let i = 0; i < facilities.length; i++) {
        const f = facilities[i]
        if (f.regex.test(callsign)) {
          const ratingValue = ratingRaw != null ? Number(ratingRaw) : null
          const requiredRatingValue = f.requiredRating != null ? Number(f.requiredRating) : null
          const meetsRating =
            requiredRatingValue == null || (ratingValue != null && ratingValue >= requiredRatingValue)
          if (meetsRating) {
            results[i].sessions++
            results[i].hours += hours
            results[i].tracked += tracked
            facilityName = f.name
          } else {
            training.sessions++
            training.hours += hours
            training.tracked += tracked
            facilityName = f.name
            isTraining = true
          }
          bucketed = true
          break
        }
      }
    }

    if (!bucketed) {
      unmatched.sessions++
      unmatched.hours += hours
      unmatched.tracked += tracked
    }

    sessionDetails.push({
      facility: facilityName,
      isTraining,
      callsign,
      rating: ratingRaw ?? null,
      start: startStr || '',
      end: endStr || '',
      hours,
      tracked,
    })
  }

  sessionDetails.sort((a, b) => {
    const aDate = new Date(a.end || a.start || 0).getTime()
    const bDate = new Date(b.end || b.start || 0).getTime()
    return bDate - aDate
  })

  return { facilityResults: results, unmatched, training, sessionDetails }
}
