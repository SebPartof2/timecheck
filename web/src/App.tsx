import * as React from 'react'
import { UserBar } from '@/components/UserBar'
import { CidSearch } from '@/components/CidSearch'
import { HoursPanel } from '@/components/HoursPanel'
import { SessionsPanel } from '@/components/SessionsPanel'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import {
  getATCSessions,
  getCombinedRoster,
  getCurrentUser,
  getFacilities,
  getPromotions,
  getTrainingRecords,
  type ATCSession,
  type CurrentUser,
  type Promotion,
  type RosterUser,
  type TrainingTicket,
} from '@/lib/api'
import { calculateHours, compileFacilities, type CompiledConfig } from '@/lib/calc'

interface FetchedResult {
  cid: string
  total: number
  sessions: ATCSession[]
  tickets: TrainingTicket[]
  promotions: Promotion[]
}

function readCidFromUrl(): string {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get('cid') || ''
}

function writeCidToUrl(cid: string) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (cid) url.searchParams.set('cid', cid)
  else url.searchParams.delete('cid')
  if (url.toString() !== window.location.href) {
    window.history.pushState({}, '', url)
  }
}

export default function App() {
  const [user, setUser] = React.useState<CurrentUser | null>(null)
  const [config, setConfig] = React.useState<CompiledConfig>({
    artccPrefixes: [],
    facilities: [],
    homeFacility: '',
  })
  const [roster, setRoster] = React.useState<RosterUser[]>([])
  const [cid, setCid] = React.useState(() => readCidFromUrl())
  const [startDate, setStartDate] = React.useState('')
  const [endDate, setEndDate] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fetched, setFetched] = React.useState<FetchedResult | null>(null)
  const requestIdRef = React.useRef(0)
  const handleCheckRef = React.useRef<((cidArg?: string) => void) | null>(null)

  React.useEffect(() => {
    getCurrentUser()
      .then((u) => {
        if (u) setUser(u)
        else window.location.href = '/auth/login'
      })
      .catch(() => undefined)
    getFacilities()
      .then((cfg) => setConfig(compileFacilities(cfg)))
      .catch((e) => setError(e.message))
    getCombinedRoster()
      .then(setRoster)
      .catch(() => undefined)
  }, [])

  const handleCheck = React.useCallback(
    async (cidArg?: string) => {
      const targetCid = (cidArg ?? cid).trim()
      setError(null)
      if (!targetCid || !/^\d+$/.test(targetCid)) {
        setError('Please enter a valid numeric CID.')
        return
      }
      writeCidToUrl(targetCid)
      const reqId = ++requestIdRef.current
      setFetched(null)
      setLoading(true)
      try {
        const [{ count, sessions }, tickets, promotions] = await Promise.all([
          getATCSessions(targetCid),
          getTrainingRecords(targetCid).catch(() => [] as TrainingTicket[]),
          getPromotions(targetCid).catch(() => [] as Promotion[]),
        ])
        if (reqId !== requestIdRef.current) return
        setFetched({ cid: targetCid, total: count, sessions, tickets, promotions })
      } catch (e) {
        if (reqId !== requestIdRef.current) return
        setError((e as Error).message)
      } finally {
        if (reqId === requestIdRef.current) setLoading(false)
      }
    },
    [cid],
  )

  React.useEffect(() => {
    handleCheckRef.current = handleCheck
  }, [handleCheck])

  // Auto-fetch once when the page loads with ?cid=<n>
  const initialCidRef = React.useRef(readCidFromUrl())
  const autoFetchedRef = React.useRef(false)
  React.useEffect(() => {
    if (autoFetchedRef.current) return
    if (initialCidRef.current && handleCheckRef.current) {
      autoFetchedRef.current = true
      handleCheckRef.current(initialCidRef.current)
    }
  }, [user])

  // Handle browser back/forward buttons
  React.useEffect(() => {
    const onPopState = () => {
      const newCid = readCidFromUrl()
      setCid(newCid)
      if (newCid) {
        handleCheckRef.current?.(newCid)
      } else {
        setFetched(null)
        setError(null)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const hours = React.useMemo(() => {
    if (!fetched) return null
    return calculateHours(fetched.sessions, config, startDate || null, endDate || null)
  }, [fetched, config, startDate, endDate])

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Timecheck</h1>
        <UserBar user={user} />
      </div>

      <div className="space-y-4">
        <CidSearch value={cid} onChange={setCid} onSubmit={handleCheck} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="start-date">Start Date (optional)</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="end-date">End Date (optional)</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-3 rounded-md border bg-card py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Fetching ATC sessions…
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {fetched && hours && !loading && (
          <>
            <HoursPanel cid={fetched.cid} total={fetched.total} result={hours} />
            <SessionsPanel
              sessions={hours.sessionDetails}
              tickets={fetched.tickets}
              promotions={fetched.promotions}
              roster={roster}
              homeFacility={config.homeFacility}
            />
          </>
        )}
      </div>
    </div>
  )
}
