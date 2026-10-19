import { useEffect, useState } from 'react'
import { demoApi, type DemoSchedule } from '../lib/api'
import { Card, Note } from '../components/ui'
import { AnnouncementsPage } from './AnnouncementsPage'
export function StationPage() {
  const [schedules, setSchedules] = useState<DemoSchedule[]>([]),
    [error, setError] = useState('')
  useEffect(() => {
    demoApi
      .schedules()
      .then((r) => setSchedules(r.schedules))
      .catch((e) => setError(e.message))
  }, [])
  return (
    <div className="flex flex-col gap-6">
      <Card title="Station master · departures and announcements">
        <Note>
          Manage your station’s passenger announcements. The TTE is responsible
          for boarding passengers.
        </Note>
        {error ? <Note kind="error">{error}</Note> : null}
        <ul className="mt-4 max-h-64 overflow-auto">
          {schedules.map((s) => (
            <li
              key={s.SCHEDULE_ID}
              className="border-t border-line py-2 text-sm"
            >
              {s.JOURNEY_DATE} · {s.TRAIN_NO} {s.TRAIN_NAME} · schedule{' '}
              {s.SCHEDULE_ID}
            </li>
          ))}
        </ul>
      </Card>
      <AnnouncementsPage manage />
    </div>
  )
}
