import { useEffect, useState } from 'react'
import { api, type OccupancyRow, type RevenueDay, type ZoneSummaryRow } from '../lib/api'
import { Badge, Card, Note } from '../components/ui'
import { formatFare } from '../lib/format'

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="h-2 w-full rounded bg-line">
      <div className="h-2 rounded bg-primary" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function ReportingPage() {
  const [days, setDays] = useState<RevenueDay[]>([])
  const [zones, setZones] = useState<ZoneSummaryRow[]>([])
  const [occupancy, setOccupancy] = useState<OccupancyRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.revenueDaily(), api.zoneSummary(), api.occupancy(10)])
      .then(([r, z, o]) => {
        setDays(r.days)
        setZones(z.zones)
        setOccupancy(o.rows)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'could not load reports'))
  }, [])

  const maxRevenue = Math.max(1, ...days.map((d) => d.REVENUE_TOTAL))

  return (
    <div className="flex flex-col gap-6">
      {error ? <Note kind="error">{error}</Note> : null}

      <Card title="Daily revenue">
        {days.length === 0 ? (
          <Note>No captured payments yet.</Note>
        ) : (
          <ul className="flex flex-col gap-3">
            {days.map((d) => (
              <li key={d.REVENUE_DATE} className="text-sm">
                <div className="mb-1 flex justify-between">
                  <span className="text-muted">{d.REVENUE_DATE}</span>
                  <span className="font-medium text-ink">
                    {formatFare(d.REVENUE_TOTAL)} · {d.BOOKING_COUNT} bookings
                  </span>
                </div>
                <Bar value={d.REVENUE_TOTAL} max={maxRevenue} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Zone summary">
        <table className="w-full text-left text-sm">
          <thead className="text-muted">
            <tr>
              <th className="py-2">Zone</th>
              <th className="py-2">Bookings</th>
              <th className="py-2">Gross fare</th>
              <th className="py-2">Confirmed</th>
              <th className="py-2">Waitlisted</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => (
              <tr key={z.ZONE_ID} className="border-t border-line">
                <td className="py-2 font-medium">{z.ZONE_CODE} — {z.ZONE_NAME}</td>
                <td className="py-2">{z.BOOKING_COUNT}</td>
                <td className="py-2">{formatFare(z.GROSS_FARE)}</td>
                <td className="py-2">{z.CONFIRMED_TICKETS}</td>
                <td className="py-2">{z.WAITLISTED_TICKETS}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Top occupancy">
        {occupancy.length === 0 ? (
          <Note>No seat data available.</Note>
        ) : (
          <ul className="flex flex-col gap-3">
            {occupancy.map((o) => (
              <li key={`${o.SCHEDULE_ID}-${o.COACH_CLASS}`} className="text-sm">
                <div className="mb-1 flex justify-between">
                  <span className="text-muted">
                    Schedule {o.SCHEDULE_ID} · {o.COACH_CLASS}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-ink">{o.OCCUPANCY_PCT}%</span>
                    <Badge tone={o.OCCUPANCY_PCT >= 80 ? 'warn' : 'ok'}>
                      {o.OCCUPIED_SEATS}/{o.SEAT_COUNT}
                    </Badge>
                  </span>
                </div>
                <Bar value={o.OCCUPANCY_PCT} max={100} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
