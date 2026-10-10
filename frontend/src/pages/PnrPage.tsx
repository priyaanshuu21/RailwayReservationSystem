import { useState, type FormEvent } from 'react'
import { api, type BookingView } from '../lib/api'
import { useAuth } from '../auth/AuthContext'
import { Badge, Button, Card, Field, Input, Note } from '../components/ui'

export function PnrPage() {
  const { user } = useAuth()
  const [pnr, setPnr] = useState('')
  const [booking, setBooking] = useState<BookingView | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      setMessage(`Cancelled. Refund ₹${res.refundAmount} requested (zone ${res.zone}).`)
      setBooking(await api.booking(booking.pnr))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'cancel failed')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card title="Check PNR status">
        <form onSubmit={onLookup} className="flex flex-wrap items-end gap-4">
          <Field label="PNR">
            <Input value={pnr} onChange={(e) => setPnr(e.target.value)} placeholder="PN00000001" required />
          </Field>
          <Button type="submit" disabled={!user}>
            Look up
          </Button>
        </form>
        {!user ? <div className="mt-3"><Note>Sign in to view a booking.</Note></div> : null}
      </Card>

      {error ? <Note kind="error">{error}</Note> : null}
      {message ? <Note>{message}</Note> : null}

      {booking ? (
        <Card title={`PNR ${booking.pnr}`}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted">Passenger</dt><dd className="font-medium text-ink">{booking.passengerName}</dd></div>
            <div><dt className="text-muted">Class</dt><dd className="font-medium text-ink">{booking.coachClass}</dd></div>
            <div><dt className="text-muted">Journey</dt><dd className="font-medium text-ink">{booking.journeyDate}</dd></div>
            <div><dt className="text-muted">Fare</dt><dd className="font-medium text-ink">₹{booking.fareTotal}</dd></div>
            <div className="flex items-center gap-2"><dt className="text-muted">Ticket</dt><dd><Badge tone="info">{booking.ticketStatus}</Badge></dd></div>
            <div><dt className="text-muted">Zone</dt><dd className="font-medium text-ink">{booking.zoneCode}</dd></div>
          </dl>
          {booking.ticketStatus !== 'CNL' ? (
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
