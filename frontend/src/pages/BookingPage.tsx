import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, type Availability, type BookingView } from '../lib/api'
import { useAuth } from '../auth/AuthContext'
import { Badge, Button, Card, Field, Input, Note, Select } from '../components/ui'

const CLASSES = ['1A', '2A', '3A', 'SL', 'CC', '2S', 'FC']

interface BookResult {
  bookingId: number
  pnr: string
  status: string
  zone: string
}

export function BookingPage() {
  const [params] = useSearchParams()
  const { user } = useAuth()
  const scheduleId = Number(params.get('scheduleId') ?? 0)
  const fromStop = Number(params.get('from') ?? 0)
  const toStop = Number(params.get('to') ?? 0)
  const train = params.get('train') ?? 'Train'

  const [coachClass, setCoachClass] = useState('SL')
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [booking, setBooking] = useState<BookResult | null>(null)
  const [view, setView] = useState<BookingView | null>(null)
  const [method, setMethod] = useState<'U' | 'C' | 'W'>('U')
  const [upiHandle, setUpiHandle] = useState('demo@upi')
  const [paid, setPaid] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!scheduleId) return
    api
      .availability(scheduleId, coachClass)
      .then(setAvailability)
      .catch(() => setAvailability(null))
  }, [scheduleId, coachClass])

  async function onBook() {
    setError(null)
    try {
      const result = await api.book({
        scheduleId,
        fromStop,
        toStop,
        coachClass,
        requestId: `WEB-${scheduleId}-${fromStop}-${toStop}-${coachClass}`
      })
      setBooking(result)
      setView(await api.booking(result.pnr))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'booking failed')
    }
  }

  async function onPay() {
    if (!booking) return
    setError(null)
    try {
      await api.pay({
        zoneCode: booking.zone,
        bookingId: booking.bookingId,
        method,
        amount: view?.fareTotal ?? 0,
        providerRef: `GW-${booking.bookingId}`,
        requestId: `PAY-${booking.bookingId}`,
        upiHandle: method === 'U' ? upiHandle : undefined
      })
      const refreshed = await api.booking(booking.pnr)
      setView(refreshed)
      setPaid(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'payment failed')
    }
  }

  if (!scheduleId) {
    return <Note kind="error">Missing schedule. Start from a search result.</Note>
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card title={train}>
        <p className="mb-4 text-sm text-muted">
          Schedule #{scheduleId} · stop {fromStop} → {toStop}
        </p>
        <Field label="Coach class">
          <Select value={coachClass} onChange={(e) => setCoachClass(e.target.value)}>
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        {availability ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={availability.freeSeats > 0 ? 'ok' : 'warn'}>{availability.freeSeats} free</Badge>
            <Badge tone="info">RAC {availability.racRemaining}</Badge>
            <Badge tone="info">WL {availability.wlRemaining}</Badge>
            <Badge tone="info">zone {availability.zone}</Badge>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">Availability unavailable.</p>
        )}

        <div className="mt-6">
          {!user ? (
            <Note>Sign in as a passenger to book.</Note>
          ) : booking ? null : (
            <Button onClick={onBook}>Reserve seat</Button>
          )}
        </div>
        {error ? <div className="mt-4"><Note kind="error">{error}</Note></div> : null}
      </Card>

      {booking ? (
        <Card title="Complete payment">
          <div className="mb-4 flex items-center gap-2">
            <Badge tone="ok">PNR {booking.pnr}</Badge>
            <Badge tone="info">{booking.status}</Badge>
          </div>
          {paid && view ? (
            <div className="flex flex-col gap-2 text-sm text-ink">
              <p>Ticket status: <strong>{view.ticketStatus}</strong></p>
              <p>Fare paid: <strong>₹{view.fareTotal}</strong></p>
              <p className="text-success">Payment captured. Have a safe journey.</p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">
                Fare due: <strong>₹{view?.fareTotal ?? '—'}</strong>
              </p>
              <Field label="Payment method">
                <Select value={method} onChange={(e) => setMethod(e.target.value as 'U' | 'C' | 'W')}>
                  <option value="U">UPI</option>
                  <option value="C">Card</option>
                  <option value="W">Wallet</option>
                </Select>
              </Field>
              {method === 'U' ? (
                <div className="mt-3">
                  <Field label="UPI handle">
                    <Input value={upiHandle} onChange={(e) => setUpiHandle(e.target.value)} />
                  </Field>
                </div>
              ) : null}
              <div className="mt-4">
                <Button onClick={onPay}>Pay now</Button>
              </div>
            </>
          )}
        </Card>
      ) : null}
    </div>
  )
}
