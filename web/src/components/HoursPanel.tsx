import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { HoursResult } from '@/lib/calc'

export function HoursPanel({
  cid,
  total,
  result,
}: {
  cid: string
  total: number
  result: HoursResult
}) {
  const { facilityResults, unmatched, training } = result
  const visibleFacilities = facilityResults.filter((f) => f.sessions > 0)

  let totalSessions = 0
  let totalHours = 0
  let totalTracked = 0
  for (const r of visibleFacilities) {
    totalSessions += r.sessions
    totalHours += r.hours
    totalTracked += r.tracked
  }
  if (unmatched.sessions > 0) {
    totalSessions += unmatched.sessions
    totalHours += unmatched.hours
    totalTracked += unmatched.tracked
  }
  // Training is intentionally excluded from totals.

  return (
    <Card>
      <CardContent className="p-0">
        <p className="border-b px-6 py-3 text-sm text-muted-foreground">
          Results for CID {cid} — {total} total session{total !== 1 ? 's' : ''}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Facility</TableHead>
              <TableHead className="text-right">Sessions</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead className="text-right">Tracked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleFacilities.map((r) => (
              <TableRow key={r.name}>
                <TableCell>{r.name}</TableCell>
                <TableCell className="text-right tabular-nums">{r.sessions}</TableCell>
                <TableCell className="text-right tabular-nums">{r.hours.toFixed(1)}</TableCell>
                <TableCell className="text-right tabular-nums">{r.tracked}</TableCell>
              </TableRow>
            ))}
            {unmatched.sessions > 0 && (
              <TableRow className="text-muted-foreground italic">
                <TableCell>{unmatched.name}</TableCell>
                <TableCell className="text-right tabular-nums">{unmatched.sessions}</TableCell>
                <TableCell className="text-right tabular-nums">{unmatched.hours.toFixed(1)}</TableCell>
                <TableCell className="text-right tabular-nums">{unmatched.tracked}</TableCell>
              </TableRow>
            )}
            {training.sessions > 0 && (
              <TableRow className="text-amber-500/90 italic">
                <TableCell title="Sessions on a facility above the user's current rating — not counted in totals.">
                  {training.name}
                </TableCell>
                <TableCell className="text-right tabular-nums">{training.sessions}</TableCell>
                <TableCell className="text-right tabular-nums">{training.hours.toFixed(1)}</TableCell>
                <TableCell className="text-right tabular-nums">{training.tracked}</TableCell>
              </TableRow>
            )}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">Total</TableCell>
              <TableCell className="text-right tabular-nums font-semibold">{totalSessions}</TableCell>
              <TableCell className="text-right tabular-nums font-semibold">{totalHours.toFixed(1)}</TableCell>
              <TableCell className="text-right tabular-nums font-semibold">{totalTracked}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  )
}
