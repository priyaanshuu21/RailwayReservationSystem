import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, demoApi, type Announcement, type Station } from '../lib/api'
import { Button, Card, Field, Input, Note, Select } from '../components/ui'

export function AnnouncementsPage({ manage = false }: { manage?: boolean }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [station, setStation] = useState('')
  const [message, setMessage] = useState(
    'Train 12001 will arrive at platform 2. Please arrive 20 minutes before departure.',
  )
  const [hours, setHours] = useState('24')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => {
    demoApi
      .announcements()
      .then((r) => setAnnouncements(r.announcements))
      .catch((e) => setError(e.message))
  }, [])
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    if (!manage) return
    Promise.all([api.stations(), demoApi.scope()])
      .then(([r, scope]) => {
        const allowed = r.stations.filter(
          (s) =>
            (!scope.zoneId || s.ZONE_ID === scope.zoneId) &&
            (!scope.stationId || s.STATION_ID === scope.stationId),
        )
        setStations(allowed)
        setStation(String(allowed[0]?.STATION_ID ?? ''))
      })
      .catch((e) => setError(e.message))
  }, [manage])
  async function publish(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setBusy(true)
    try {
      await demoApi.publish(Number(station), message, Number(hours))
      setSuccess(
        'Announcement published. Passengers can now see it in Notices.',
      )
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-4">
      {manage ? (
        <Card title="Publish a train announcement">
          <form onSubmit={publish} className="flex flex-col gap-3">
            <Field label="Station">
              <Select
                required
                value={station}
                onChange={(e) => setStation(e.target.value)}
              >
                {stations.map((s) => (
                  <option key={s.STATION_ID} value={s.STATION_ID}>
                    {s.STATION_NAME}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Announcement">
              <Input
                required
                minLength={5}
                maxLength={300}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </Field>
            <Field label="Visible for (hours)">
              <Input
                type="number"
                min={1}
                max={720}
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </Field>
            <Button disabled={busy || !station}>
              {busy ? 'Publishing…' : 'Publish announcement'}
            </Button>
          </form>
        </Card>
      ) : null}
      {error ? <Note kind="error">{error}</Note> : null}
      {success ? <Note>{success}</Note> : null}
      <Card title="Passenger notices">
        <div className="mb-3">
          <Button variant="ghost" onClick={load}>
            Refresh notices
          </Button>
        </div>
        {announcements.length === 0 ? (
          <Note>No active announcements.</Note>
        ) : (
          announcements.map((a) => (
            <article
              key={a.ANNOUNCEMENT_ID}
              className="border-t border-line py-3"
            >
              <p className="font-semibold">{a.STATION_NAME}</p>
              <p>{a.MESSAGE}</p>
              <p className="text-sm text-muted">
                {a.AUTHOR} · {a.CREATED_AT}
              </p>
            </article>
          ))
        )}
      </Card>
    </div>
  )
}
