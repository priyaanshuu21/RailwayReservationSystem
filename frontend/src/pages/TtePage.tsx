import { useEffect, useState, type FormEvent } from 'react'
import { api, demoApi, type DemoSchedule, type TteTicket } from '../lib/api'
import { Badge, Button, Card, Field, Note, Select } from '../components/ui'

export function TtePage() {
  const [schedules, setSchedules] = useState<DemoSchedule[]>([])
  const [scheduleId, setScheduleId] = useState('')
  const [zoneCode, setZoneCode] = useState('NR')
  const [tickets, setTickets] = useState<TteTicket[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    demoApi
      .schedules()
      .then((r) => {
        setSchedules(r.schedules)
        setScheduleId(String(r.schedules[0]?.SCHEDULE_ID ?? ''))
        setZoneCode(r.schedules[0]?.ZONE_CODE ?? 'NR')
      })
      .catch((e) => setError(e.message))
  }, [])

  async function onLoad(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    try {
      const res = await api.schedulePassengers(Number(scheduleId))
      setTickets(res.tickets)
    } catch (err) {
      setTickets(null)
      setError(
        err instanceof Error ? err.message : 'could not load passenger list',
      )
    }
  }

  async function onBoard(pnr: string) {
    setError(null)
    try {
      const res = await api.board(pnr, zoneCode)
      setMessage(res.message)
      const res2 = await api.schedulePassengers(Number(scheduleId))
      setTickets(res2.tickets)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'boarding failed')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card title="TTE console">
        <div className="mb-4">
          <Note>
            Choose a journey, load passengers, then mark a confirmed passenger
            as boarded. Train 10001 on 20 October has seeded passengers. Staff
            alerts have a sensor dropdown and example readings.
          </Note>
        </div>
        <form onSubmit={onLoad} className="flex flex-wrap items-end gap-4">
          <Field label="Schedule id">
            <Select
              value={scheduleId}
              onChange={(e) => {
                setScheduleId(e.target.value)
                setZoneCode(
                  schedules.find(
                    (s) => s.SCHEDULE_ID === Number(e.target.value),
                  )?.ZONE_CODE ?? 'NR',
                )
                setTickets(null)
              }}
              required
            >
              <option value="">Select a journey</option>
              {schedules.map((s) => (
                <option key={s.SCHEDULE_ID} value={s.SCHEDULE_ID}>
                  {s.JOURNEY_DATE} · {s.TRAIN_NO} {s.TRAIN_NAME} · #
                  {s.SCHEDULE_ID}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Zone">
            <span className="py-2">{zoneCode} (from selected journey)</span>
          </Field>
          <Button type="submit">Load passengers</Button>
        </form>
        {error ? (
          <div className="mt-3">
            <Note kind="error">{error}</Note>
          </div>
        ) : null}
        {message ? (
          <div className="mt-3">
            <Note>{message}</Note>
          </div>
        ) : null}
      </Card>

      {tickets ? (
        <Card title={`${tickets.length} passenger(s)`}>
          <table className="w-full text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th className="py-2">PNR</th>
                <th className="py-2">Passenger</th>
                <th className="py-2">Coach/Seat</th>
                <th className="py-2">Status</th>
                <th className="py-2">Boarded</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.PNR} className="border-t border-line">
                  <td className="py-2 font-medium">{t.PNR}</td>
                  <td className="py-2">{t.PASSENGER_NAME}</td>
                  <td className="py-2">
                    {t.COACH_NO ?? '—'}/{t.SEAT_NO ?? '—'}
                  </td>
                  <td className="py-2">
                    <Badge tone={t.STATUS === 'CFM' ? 'ok' : 'warn'}>
                      {t.STATUS}
                    </Badge>
                  </td>
                  <td className="py-2">
                    {t.BOARDING_STATUS === 'B' ? 'Yes' : 'No'}
                  </td>
                  <td className="py-2 text-right">
                    {t.STATUS === 'CFM' && t.BOARDING_STATUS !== 'B' ? (
                      <Button variant="ghost" onClick={() => onBoard(t.PNR)}>
                        Board
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  )
}
