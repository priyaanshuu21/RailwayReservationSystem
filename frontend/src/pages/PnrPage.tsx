import { useEffect, useState, type FormEvent } from 'react'
import { api, demoApi, type MyBooking, type BookingView } from '../lib/api'
import { useAuth } from '../auth/AuthContext'
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Note,
  Select,
} from '../components/ui'

export function PnrPage() {
  const { user } = useAuth()
  const [historyFilter, setHistoryFilter] = useState('active')
  const [history, setHistory] = useState<MyBooking[]>([])
  const [pnr, setPnr] = useState('')
  const [booking, setBooking] = useState<BookingView | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user?.roles.includes('passenger'))
      demoApi
        .bookings()
        .then((r) => setHistory(r.bookings))
        .catch((e) => setError(e.message))
  }, [user])

  const visibleHistory = history.filter(
    (b) =>
      historyFilter === 'all' ||
      (historyFilter === 'cancelled' ? b.STATUS === 'CNL' : b.STATUS !== 'CNL'),
  )

  async function onLookup(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    try {
      setBooking(await api.booking(pnr.trim().toUpperCase()))
    } catch (err) {
      setBooking(null)
      setError(err instanceof Error ? err.message : 'lookup failed')
    }
  }

  async function onCancel() {
    if (!booking) return
    setError(null)
    try {
      const res = await api.cancel(booking.pnr)
      setMessage(
        `Cancelled. Refund ₹${res.refundAmount} requested (zone ${res.zone}).`,
      )
      setBooking(await api.booking(booking.pnr))
      setHistory((await demoApi.bookings()).bookings)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'cancel failed')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {user?.roles.includes('passenger') ? (
        <Card title="My bookings">
          <div className="mb-3">
            <Field label="Show bookings">
              <Select
                value={historyFilter}
                onChange={(e) => setHistoryFilter(e.target.value)}
              >
                <option value="active">Active bookings</option>
                <option value="all">All bookings</option>
                <option value="cancelled">Cancelled bookings</option>
              </Select>
            </Field>
          </div>
          <div className="mb-3">
            <Button
              variant="ghost"
              onClick={() => {
                demoApi
                  .bookings()
                  .then((r) => setHistory(r.bookings))
                  .catch((e) => setError(e.message))
              }}
            >
              Refresh bookings
            </Button>
          </div>
          {visibleHistory.length === 0 ? (
            <Note>No bookings yet. Search for a train to reserve a seat.</Note>
          ) : (
            <ul className="max-h-80 overflow-auto">
              {visibleHistory.map((b) => (
                <li
                  key={b.PNR}
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-3 text-sm"
                >
                  <span>
                    {b.TRAIN_NAME} · {b.JOURNEY_DATE} · {b.COACH_CLASS} ·{' '}
                    <strong>
                      {(
                        {
                          CFM: 'Confirmed',
                          RAC: 'RAC',
                          WL: 'Waiting list',
                          CNL: 'Cancelled',
                        } as Record<string, string>
                      )[b.STATUS] ?? b.STATUS}
                    </strong>{' '}
                    · {b.PNR}
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setPnr(b.PNR)
                      setMessage('')
                      api
                        .booking(b.PNR)
                        .then(setBooking)
                        .catch((e) => setError(e.message))
                    }}
                  >
                    View ticket
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
      <Card title="Check PNR status">
        <form onSubmit={onLookup} className="flex flex-wrap items-end gap-4">
          <Field label="PNR">
            <Input
              value={pnr}
              onChange={(e) => setPnr(e.target.value)}
              placeholder="PN00000001"
              required
            />
          </Field>
          <Button type="submit" disabled={!user}>
            Look up
          </Button>
        </form>
        {!user ? (
          <div className="mt-3">
            <Note>Sign in to view a booking.</Note>
          </div>
        ) : null}
      </Card>

      {error ? <Note kind="error">{error}</Note> : null}
      {message ? <Note>{message}</Note> : null}

      {booking ? (
        <Card title={`PNR ${booking.pnr}`}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted">Passenger</dt>
              <dd className="font-medium text-ink">{booking.passengerName}</dd>
            </div>
            <div>
              <dt className="text-muted">Class</dt>
              <dd className="font-medium text-ink">{booking.coachClass}</dd>
            </div>
            <div>
              <dt className="text-muted">Journey</dt>
              <dd className="font-medium text-ink">{booking.journeyDate}</dd>
            </div>
            <div>
              <dt className="text-muted">Fare</dt>
              <dd className="font-medium text-ink">₹{booking.fareTotal}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="text-muted">Ticket</dt>
              <dd>
                <Badge tone="info">
                  {(
                    {
                      CFM: 'Confirmed (CFM)',
                      RAC: 'RAC',
                      WL: 'Waiting list (WL)',
                      CNL: 'Cancelled (CNL)',
                    } as Record<string, string>
                  )[booking.ticketStatus] ?? booking.ticketStatus}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted">Zone</dt>
              <dd className="font-medium text-ink">{booking.zoneCode}</dd>
            </div>
            <div>
              <dt className="text-muted">Coach / seat / berth</dt>
              <dd>
                {booking.coachNo ?? 'Pending'} / {booking.seatNo ?? 'Pending'} /{' '}
                {booking.berth ?? 'Pending'}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Queue position</dt>
              <dd>{booking.queuePosition ?? '—'}</dd>
            </div>
          </dl>
          {booking.ticketStatus !== 'CNL' &&
          user?.roles.includes('passenger') ? (
            <div className="mt-5">
              <Button variant="danger" onClick={onCancel}>
                Cancel booking
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  )
}
