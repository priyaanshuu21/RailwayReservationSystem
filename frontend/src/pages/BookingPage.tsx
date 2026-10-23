import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, demoApi, type Availability, type BookingView } from '../lib/api'
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

  const [classes, setClasses] = useState<string[]>([])
  const [berthPreference, setBerthPreference] = useState('')
  const [busy, setBusy] = useState(false)
  const [availabilityError, setAvailabilityError] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [coachClass, setCoachClass] = useState('SL')
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [booking, setBooking] = useState<BookResult | null>(null)
  const [view, setView] = useState<BookingView | null>(null)
  const [method, setMethod] = useState<'U' | 'C' | 'W'>('U')
  const [upiHandle, setUpiHandle] = useState('demo@upi')
  const [paid, setPaid] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    demoApi
      .classes(scheduleId)
      .then((r) => {
        setClasses(r.classes)
        setCoachClass(r.classes.includes('SL') ? 'SL' : (r.classes[0] ?? ''))
      })
      .catch((e) => setAvailabilityError(e.message))
  }, [scheduleId])
  useEffect(() => {
    let active = true
    setAvailability(null)
    setAvailabilityError('')
    if (!scheduleId || !coachClass) return
    api
      .availability(scheduleId, coachClass)
      .then((r) => {
        if (active) setAvailability(r)
      })
      .catch((e) => {
        if (active) setAvailabilityError(e.message)
      })
    return () => {
      active = false
    }
  }, [scheduleId, coachClass])

  async function onBook() {
    setError(null)
    setBusy(true)
    try {
      const result = await api.book({
        scheduleId,
        fromStop,
        toStop,
        coachClass,
        requestId,
        berthPreference: berthPreference || undefined,
      })
      setBooking(result)
      setView(await api.booking(result.pnr))
      setAvailability(await api.availability(scheduleId, coachClass))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'booking failed')
    } finally {
      setBusy(false)
    }
  }

  async function onPay() {
    if (!booking) return
    setError(null)
    setBusy(true)
    try {
      await api.pay({
        zoneCode: booking.zone,
        bookingId: booking.bookingId,
        method,
        amount: view?.fareTotal ?? 0,
        providerRef: `GW-${booking.bookingId}`,
        requestId: `PAY-${booking.bookingId}`,
        upiHandle: method === 'U' ? upiHandle : undefined,
        maskedPan: method === 'C' ? '4111 XXXX XXXX 1111' : undefined,
        cardScheme: method === 'C' ? 'VISA' : undefined,
        walletProvider: method === 'W' ? 'DemoWallet' : undefined,
        walletTxn: method === 'W' ? `DEMO-${booking.bookingId}` : undefined,
      })
      const refreshed = await api.booking(booking.pnr)
      setView(refreshed)
      setPaid(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'payment failed')
    } finally {
      setBusy(false)
    }
  }

  if (!scheduleId) {
    return (
      <Note kind="error">Missing schedule. Start from a search result.</Note>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card title={train}>
        <p className="mb-4 text-sm text-muted">
          Schedule #{scheduleId} · stop {fromStop} → {toStop}
        </p>
        <Field label="Coach class">
          <Select
            value={coachClass}
            disabled={!!booking}
            onChange={(e) => {
              setCoachClass(e.target.value)
              setRequestId(crypto.randomUUID())
            }}
          >
            {classes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <div className="mt-3">
          <Field label="Berth preference (subject to availability)">
            <Select
              disabled={!!booking}
              value={berthPreference}
              onChange={(e) => setBerthPreference(e.target.value)}
            >
              <option value="">No preference</option>
              <option value="LB">Lower berth</option>
              <option value="MB">Middle berth</option>
              <option value="UB">Upper berth</option>
              <option value="SL">Side lower</option>
              <option value="SU">Side upper</option>
            </Select>
          </Field>
        </div>
        {availabilityError ? (
          <Note kind="error">{availabilityError}</Note>
        ) : null}
        {availability ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={availability.freeSeats > 0 ? 'ok' : 'warn'}>
              {availability.freeSeats} confirmed seats available
            </Badge>
            <Badge tone="info">
              RAC capacity remaining: {availability.racRemaining}
            </Badge>
            <Badge tone="info">
              Waiting-list capacity remaining: {availability.wlRemaining}
            </Badge>
            <Badge tone="info">zone {availability.zone}</Badge>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">Loading availability…</p>
        )}

        <div className="mt-3">
          <Note>
            RAC and waiting-list numbers above are remaining capacity, not
            passengers already waiting. They are used only after confirmed seats
            run out. For a 2-seat example, open Live demo.
          </Note>
        </div>
        <div className="mt-6">
          {!user?.roles.includes('passenger') ? (
            <Note>Sign in as a passenger to book.</Note>
          ) : booking ? null : (
            <Button
              disabled={
                busy ||
                !availability ||
                availability.freeSeats +
                  availability.racRemaining +
                  availability.wlRemaining ===
                  0
              }
              onClick={onBook}
            >
              {busy
                ? 'Reserving…'
                : availability?.freeSeats === 0
                  ? 'Join RAC / waiting list'
                  : 'Reserve seat'}
            </Button>
          )}
        </div>
        {error ? (
          <div className="mt-4">
            <Note kind="error">{error}</Note>
          </div>
        ) : null}
      </Card>

      {booking ? (
        <Card title="Reservation details and payment">
          <div className="mb-4 flex items-center gap-2">
            <Badge tone="ok">PNR {booking.pnr}</Badge>
            <Badge tone="info">
              {(
                {
                  CFM: 'Confirmed (CFM)',
                  RAC: 'RAC',
                  WL: 'Waiting list (WL)',
                } as Record<string, string>
              )[booking.status] ?? booking.status}
            </Badge>
          </div>
          {view ? (
            <div className="mb-3 text-sm">
              <p>
                Status: <strong>{view.ticketStatus}</strong>
                {view.queuePosition
                  ? ` · queue position ${view.queuePosition}`
                  : ''}
              </p>
              <p>
                Coach / seat: {view.coachNo ?? 'Pending'} /{' '}
                {view.seatNo ?? 'Pending'} · berth{' '}
                {view.berth ?? 'Assigned on confirmation'}
              </p>
              {view.ticketStatus === 'WL' ? (
                <Note>
                  You are on the waiting list. Cancellation of a confirmed
                  ticket promotes the next eligible passenger automatically.
                  Payment does not guarantee a berth.
                </Note>
              ) : null}
            </div>
          ) : null}
          {paid && view ? (
            <div className="flex flex-col gap-2 text-sm text-ink">
              <p>
                Ticket status: <strong>{view.ticketStatus}</strong>
              </p>
              <p>
                Fare paid: <strong>₹{view.fareTotal}</strong>
              </p>
              <p className="text-success">
                {view.ticketStatus === 'WL'
                  ? 'Payment captured. Your ticket remains on the waiting list.'
                  : 'Payment captured. Have a safe journey.'}
              </p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">
                Fare due: <strong>₹{view?.fareTotal ?? '—'}</strong>
              </p>
              <Field label="Payment method">
                <Select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as 'U' | 'C' | 'W')}
                >
                  <option value="U">UPI</option>
                  <option value="C">Card</option>
                  <option value="W">Wallet</option>
                </Select>
              </Field>
              {method === 'U' ? (
                <div className="mt-3">
                  <Field label="UPI handle">
                    <Input
                      value={upiHandle}
                      onChange={(e) => setUpiHandle(e.target.value)}
                    />
                  </Field>
                </div>
              ) : null}
              <div className="mt-4">
                <Button disabled={busy} onClick={onPay}>
                  {busy ? 'Processing…' : 'Pay demo fare'}
                </Button>
              </div>
            </>
          )}
        </Card>
      ) : null}
    </div>
  )
}
