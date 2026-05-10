export interface CurrentUser {
  cid: string
  fname?: string
  lname?: string
  name?: string
  rating: string
  roles: string[]
}

export interface RosterUser {
  cid: number | string
  fname: string
  lname: string
  rating: string
  facility?: string
}

export interface Promotion {
  id?: number | string
  cid?: number | string
  grantor?: number | string
  to?: number
  from?: number
  created_at?: string
  exam?: string | number
  examiner?: number | string
  position?: string
}

export const RATING_SHORT: Record<string, string> = {
  '-1': 'INA',
  '0': 'SUS',
  '1': 'OBS',
  '2': 'S1',
  '3': 'S2',
  '4': 'S3',
  '5': 'C1',
  '6': 'C2',
  '7': 'C3',
  '8': 'I1',
  '9': 'I2',
  '10': 'I3',
  '11': 'SUP',
  '12': 'ADM',
}

export function ratingShort(n: number | undefined | null): string {
  if (n == null) return ''
  return RATING_SHORT[String(n)] || String(n)
}

export interface TrainingTicket {
  id?: number | string
  student_id?: number | string
  instructor_id?: number | string
  session_date?: string
  facility_id?: string
  position?: string
  duration?: string | number
  movements?: number
  score?: number
  notes?: string
  location?: number | string
  ots_status?: number | string
  is_cbt?: number | boolean
  solo_granted?: number | boolean
  modified_by?: number | string
}

export interface Facility {
  name: string
  short: string
  pattern: string
  requiredRating: number | null
}

export interface FacilityConfig {
  artccPrefixes: string[]
  facilities: Facility[]
  homeFacility: string
}

export interface UserLookup {
  cid: string
  fname: string
  lname: string
  facility: string
  rating: string
}

export interface ATCSession {
  callsign?: string
  rating?: number | string
  aircrafttracked?: number
  minutes_on_callsign?: number
  connection_id?: {
    callsign?: string
    rating?: number | string
    start?: string
    end?: string
  }
}

function authRedirectIfNeeded(res: Response) {
  if (res.status === 401) {
    window.location.href = '/auth/login'
    throw new Error('Not signed in')
  }
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const res = await fetch('/api/me', { credentials: 'same-origin' })
  if (res.status === 401) return null
  if (!res.ok) return null
  return res.json()
}

export async function getFacilities(): Promise<FacilityConfig> {
  const res = await fetch('/api/facilities', { credentials: 'same-origin' })
  authRedirectIfNeeded(res)
  if (!res.ok) throw new Error('Failed to load facilities config')
  const data = await res.json()
  return {
    artccPrefixes: Array.isArray(data.artccPrefixes) ? data.artccPrefixes : [],
    facilities: Array.isArray(data.facilities) ? data.facilities : [],
    homeFacility: typeof data.homeFacility === 'string' ? data.homeFacility : '',
  }
}

const userLookupCache = new Map<string, UserLookup | null>()
const userLookupInFlight = new Map<string, Promise<UserLookup | null>>()

export async function getUserLookup(cid: string): Promise<UserLookup | null> {
  const key = String(cid)
  if (userLookupCache.has(key)) return userLookupCache.get(key) ?? null
  const existing = userLookupInFlight.get(key)
  if (existing) return existing
  const p = (async () => {
    const res = await fetch(`/api/user/${encodeURIComponent(key)}`, { credentials: 'same-origin' })
    if (res.status === 401) {
      window.location.href = '/auth/login'
      return null
    }
    if (!res.ok) {
      userLookupCache.set(key, null)
      return null
    }
    const data = (await res.json()) as UserLookup
    userLookupCache.set(key, data)
    return data
  })()
  userLookupInFlight.set(key, p)
  try {
    return await p
  } finally {
    userLookupInFlight.delete(key)
  }
}

export async function getTrainingRecords(cid: string): Promise<TrainingTicket[]> {
  const res = await fetch(`/api/training/${encodeURIComponent(cid)}`, { credentials: 'same-origin' })
  if (res.status === 401) {
    window.location.href = '/auth/login'
    throw new Error('Not signed in')
  }
  if (!res.ok) return []
  const data = await res.json()
  return (data.items || []) as TrainingTicket[]
}

export async function getPromotions(cid: string): Promise<Promotion[]> {
  const res = await fetch(`/api/promotions/${encodeURIComponent(cid)}`, { credentials: 'same-origin' })
  if (res.status === 401) {
    window.location.href = '/auth/login'
    throw new Error('Not signed in')
  }
  if (!res.ok) return []
  const data = await res.json()
  return (data.items || []) as Promotion[]
}

export async function getATCSessions(cid: string): Promise<{ count: number; sessions: ATCSession[] }> {
  const res = await fetch(`/api/members/${encodeURIComponent(cid)}/atc`, { credentials: 'same-origin' })
  authRedirectIfNeeded(res)
  if (!res.ok) {
    if (res.status === 404) throw new Error('CID not found')
    throw new Error(`API error: ${res.status}`)
  }
  const data = await res.json()
  const sessions: ATCSession[] = data.items || data.results || []
  return { count: data.count != null ? data.count : sessions.length, sessions }
}

let combinedRosterCache: RosterUser[] | null = null
let combinedRosterPromise: Promise<RosterUser[]> | null = null

export async function getCombinedRoster(): Promise<RosterUser[]> {
  if (combinedRosterCache) return combinedRosterCache
  if (combinedRosterPromise) return combinedRosterPromise
  combinedRosterPromise = (async () => {
    const res = await fetch('/api/roster/both', { credentials: 'same-origin' })
    authRedirectIfNeeded(res)
    if (!res.ok) {
      const err = await res.json().catch(() => ({} as { error?: string }))
      throw new Error(err.error || `Roster fetch failed (${res.status})`)
    }
    const data = await res.json()
    combinedRosterCache = (data.users || []) as RosterUser[]
    return combinedRosterCache
  })()
  try {
    return await combinedRosterPromise
  } finally {
    combinedRosterPromise = null
  }
}

export function formatName(fname?: string, lname?: string): string {
  const f = (fname || '').trim()
  const l = (lname || '').trim()
  if (l && f) return `${l}, ${f}`
  return l || f || ''
}

export function formatNameFirstLast(fname?: string, lname?: string): string {
  const f = (fname || '').trim()
  const l = (lname || '').trim()
  if (f && l) return `${f} ${l}`
  return f || l || ''
}
