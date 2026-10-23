import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, type SearchTrain, type Station } from '../lib/api'
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Note,
  Select,
} from '../components/ui'

const TYPE_LABEL: Record<string, string> = {
  E: 'Express',
  S: 'Superfast',
  P: 'Passenger',
  F: 'Freight',
}

export function SearchPage() {
  const [stations, setStations] = useState<Station[]>([])
  const [from, setFrom] = useState('101')
  const [to, setTo] = useState('301')
  const [date, setDate] = useState('2026-10-20')
  const [trains, setTrains] = useState<SearchTrain[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .stations()
      .then((res) => setStations(res.stations))
      .catch(() =>
        setError('Could not load stations (is the API and Oracle reachable?)'),
      )
  }, [])

  async function onSearch(e: FormEvent) {
    e.preventDefault()
    if (!from || !to) return
    setBusy(true)
    setError(null)
    try {
      const res = await api.search(Number(from), Number(to), date)
      setTrains(res.trains)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'search failed')
      setTrains(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card title="Find a train">
        <Link to="/demonstrate">
          <Button className="mb-4">Start guided demo · only 2 seats</Button>
        </Link>
        <div className="mb-4">
          <Note>
            Demo dates: 1–30 October 2026, inclusive. Six passenger trains run
            every day on their listed routes. Try Northvale Junction → Southbay
            City (10001), Westport Central → Tamarind Hill (10002), or Southbay
            City → Tamarind Hill (13002). For a repeatable waiting-list example,
            use Live demo above. Normal services have larger capacity.
          </Note>
        </div>
        <form
          onSubmit={onSearch}
          className="grid grid-cols-1 gap-4 sm:grid-cols-4"
        >
          <Field label="From">
            <Select
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              required
            >
              <option value="">Select station</option>
              {stations.map((s) => (
                <option key={s.STATION_ID} value={s.STATION_ID}>
                  {s.STATION_NAME} ({s.STATION_CODE})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="To">
            <Select value={to} onChange={(e) => setTo(e.target.value)} required>
              <option value="">Select station</option>
              {stations.map((s) => (
                <option key={s.STATION_ID} value={s.STATION_ID}>
                  {s.STATION_NAME} ({s.STATION_CODE})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Journey date">
            <Input
              type="date"
              min="2026-10-01"
              max="2026-10-30"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Searching…' : 'Search'}
            </Button>
          </div>
        </form>
        {error ? (
          <div className="mt-4">
            <Note kind="error">{error}</Note>
          </div>
        ) : null}
      </Card>

      {trains ? (
        <Card title={`${trains.length} train(s) found`}>
          {trains.length === 0 ? (
            <Note>No trains serve this pair on the selected date.</Note>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {trains.map((t) => (
                <li
                  key={t.SCHEDULE_ID}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">
                        {t.TRAIN_NO} {t.TRAIN_NAME}
                      </span>
                      <Badge tone="info">
                        {TYPE_LABEL[t.TRAIN_TYPE] ?? t.TRAIN_TYPE}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted">
                      {t.DEPARTURE_TIME} → {t.ARRIVAL_TIME} · {t.DISTANCE_KM} km
                      · zone {t.ZONE_ID}
                    </p>
                  </div>
                  <Link
                    to={`/book?scheduleId=${t.SCHEDULE_ID}&from=${t.FROM_STOP}&to=${t.TO_STOP}&train=${encodeURIComponent(
                      `${t.TRAIN_NO} ${t.TRAIN_NAME}`,
                    )}`}
                  >
                    <Button>Book</Button>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </div>
  )
}
