import { useCallback, useEffect, useState } from 'react'
import { demoApi } from '../lib/api'
import { Button, Card, Note } from '../components/ui'
import { ReportingPage } from './ReportingPage'
import { AnnouncementsPage } from './AnnouncementsPage'
export function AdminPage() {
  const [audit, setAudit] = useState<Awaited<
      ReturnType<typeof demoApi.audit>
    > | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState('')
  const load = useCallback(() => {
    demoApi
      .audit()
      .then(setAudit)
      .catch((e) => setError(e.message))
  }, [])
  useEffect(() => {
    load()
  }, [load])
  return (
    <div className="flex flex-col gap-6">
      <Card title="Super administrator · all three zones">
        <Note>
          System-wide revenue, announcements, materialized-view refresh, and the
          audit events produced by booking procedures and triggers.
        </Note>
        <div className="mt-3 flex gap-3">
          <Button
            onClick={() => {
              demoApi
                .refresh()
                .then((r) => {
                  setMessage(r.refreshed)
                  load()
                })
                .catch((e) => setError(e.message))
            }}
          >
            Refresh reporting materialized view
          </Button>
          <Button variant="ghost" onClick={load}>
            Refresh audit
          </Button>
        </div>
        {message ? <Note>{message}</Note> : null}
        {error ? <Note kind="error">{error}</Note> : null}
      </Card>
      <ReportingPage />
      <Card title="Procedure and trigger activity">
        <p className="mb-3 text-sm">
          Announcement audit rows: {audit?.announcementAudits.COUNT ?? 0}.
          Outbox events:{' '}
          {audit?.outbox
            .map((z) => `${z.ZONE_CODE}: ${z.EVENT_COUNT}`)
            .join(' · ')}
        </p>
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th>Zone</th>
              <th>Booking</th>
              <th>Event</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {audit?.events.map((e, i) => (
              <tr key={i} className="border-t border-line">
                <td>{e.ZONE_CODE}</td>
                <td>{e.BOOKING_ID}</td>
                <td>{e.EVENT_TYPE}</td>
                <td>{e.EVENT_TIME}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <AnnouncementsPage manage />
    </div>
  )
}
export function ZonePage() {
  return (
    <div className="flex flex-col gap-6">
      <Card title="Zone administrator · assigned zone">
        <Note>
          Reports and announcement publishing are restricted to your assigned
          railway zone. Live figures come from the zone’s booking database.
        </Note>
      </Card>
      <ReportingPage />
      <AnnouncementsPage manage />
    </div>
  )
}
