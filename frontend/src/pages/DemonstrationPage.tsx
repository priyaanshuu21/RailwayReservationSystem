import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { practiceApi, type PracticeState } from '../lib/api'
import { Badge, Button, Card, Note, Select, Field } from '../components/ui'
const labels: Record<string, string> = {
  CFM: 'Confirmed',
  RAC: 'RAC — waiting for a full berth',
  WL: 'Waiting list',
  CNL: 'Cancelled',
}
export function DemonstrationPage() {
  const { user, hasRole } = useAuth()
  const [lab, setLab] = useState('wl'),
    [data, setData] = useState<PracticeState | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [resetOpen, setResetOpen] = useState(false)
  const load = useCallback(async () => {
    if (!user) return
    try {
      setData(await practiceApi.state(lab))
      setError('')
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Could not load practice journey',
      )
    }
  }, [lab, user])
  useEffect(() => {
    setData(null)
    setMessage('')
    setResetOpen(false)
    void load()
    const id = setInterval(() => {
      void load()
    }, 4000)
    return () => clearInterval(id)
  }, [load])
  async function action(kind: 'book' | 'cancel' | 'reset', pnr?: string) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      if (kind === 'book') {
        const r = await practiceApi.book(lab)
        setData(r.state)
        setMessage(
          `Ticket ${r.result.pnr}: ${labels[r.result.status] ?? r.result.status}.${r.result.status === 'CFM' ? ' Demo UPI payment recorded.' : ' No confirmed seat assigned yet.'}`,
        )
      } else if (kind === 'cancel') {
        const r = await practiceApi.cancel(lab, pnr!)
        setData(r.state)
        setMessage(
          `Cancelled ${r.cancelledPnr}. Refund requested: ₹${r.refundAmount}. ${r.promoted.length ? r.promoted.map((t) => `${t.PASSENGER} (${t.PNR}) → ${labels[t.STATUS] ?? t.STATUS}${t.SEAT_NO ? `, seat ${t.SEAT_NO}` : ''}`).join('. ') : 'No queued passenger needed promotion.'}`,
        )
      } else {
        const r = await practiceApi.reset(lab)
        setData(r.state)
        setMessage(r.message)
        setResetOpen(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operation failed')
      void load()
    } finally {
      setBusy(false)
    }
  }
  if (!user)
    return (
      <Card title="RailNexus · live demonstration">
        <Note>
          Sign in to demonstrate real booking, waiting-list promotion,
          cancellation and database audit events. No queries are needed.
        </Note>
        <Link to="/login">
          <Button className="mt-4">Choose an actor</Button>
        </Link>
      </Card>
    )
  return (
    <div className="flex flex-col gap-5">
      <Card title="Live demonstration · two seats, visible results">
        <p className="mb-4 text-sm text-muted">
          You are signed in as <strong>{user.fullName}</strong>. These are
          separate practice trains; normal bookings are untouched. Real Oracle
          procedures, payment simulation and audit triggers run behind every
          action.
        </p>
        <Field label="Choose demonstration">
          <Select
            disabled={busy}
            value={lab}
            onChange={(e) => setLab(e.target.value)}
          >
            <option value="wl">
              Waiting list: 2 seats → third booking waits
            </option>
            <option value="rac">
              RAC: 2 seats → third RAC → fourth waiting list
            </option>
          </Select>
        </Field>
        <p className="mt-3 font-medium">
          Northvale Junction → Southbay City · 28 October 2026 · 1A · practice
          train {lab === 'wl' ? '90001' : '90002'}
        </p>
      </Card>
      {error ? <Note kind="error">{error}</Note> : null}
      {message ? (
        <div role="status">
          <Note>{message}</Note>
        </div>
      ) : null}
      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Confirmed seats left', data.freeSeats],
              ['Confirmed passengers', data.confirmed],
              ['Passengers in RAC', data.racWaiting],
              ['Passengers on waiting list', data.waitlisted],
            ].map(([title, value]) => (
              <Card key={title}>
                <p className="text-sm text-muted">{title}</p>
                <p className="text-3xl font-bold">{value}</p>
              </Card>
            ))}
          </div>
          <Card title="1. Book until a passenger has to wait">
            <Note>
              {lab === 'wl'
                ? 'Start with two seats. Click Book ticket three times: Confirmed, Confirmed, Waiting list.'
                : 'Start with two seats and one RAC place. Click Book ticket four times: Confirmed, Confirmed, RAC, Waiting list.'}{' '}
              You can use the same passenger for the whole demonstration.
            </Note>
            <div className="mt-4 flex flex-wrap gap-3">
              {hasRole('passenger') ? (
                <Button
                  disabled={
                    busy ||
                    data.freeSeats + data.racRemaining + data.wlRemaining === 0
                  }
                  onClick={() => void action('book')}
                >
                  {busy ? 'Please wait…' : `Book ticket as ${user.fullName}`}
                </Button>
              ) : (
                <Note>
                  Use a passenger account to reserve a practice ticket.
                </Note>
              )}
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void load()}
              >
                Refresh board
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted">
              Actual capacity: {data.capacity} seats. Remaining queue capacity:{' '}
              {data.racRemaining} RAC places and {data.wlRemaining} waiting-list
              places. Queue capacity is not a count of waiting passengers.
            </p>
          </Card>
          <Card title="2. Cancel a confirmed ticket and watch promotion">
            <p className="mb-3 text-sm">
              Only cancel a <strong>Confirmed</strong> ticket below.{' '}
              {lab === 'wl'
                ? 'The waiting passenger becomes Confirmed and receives its seat.'
                : 'The RAC passenger becomes Confirmed, then the waiting-list passenger moves into RAC.'}{' '}
              Watch the status and seat change—not the number of history rows.
            </p>
            {data.tickets.length === 0 ? (
              <Note>No active practice tickets. Start by booking above.</Note>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th>Passenger / PNR</th>
                      <th>Status</th>
                      <th>Coach · seat · berth</th>
                      <th>Demo payment</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tickets.map((t) => (
                      <tr key={t.PNR} className="border-t border-line">
                        <td className="py-3">
                          {t.PASSENGER}
                          {t.PERSON_ID === user.personId ? ' (you)' : ''}
                          <br />
                          <strong>{t.PNR}</strong>
                        </td>
                        <td>
                          <Badge tone={t.STATUS === 'CFM' ? 'ok' : 'warn'}>
                            {labels[t.STATUS] ?? t.STATUS}
                          </Badge>
                        </td>
                        <td>
                          {t.SEAT_NO
                            ? `${t.COACH_NO} · ${t.SEAT_NO} · ${t.BERTH}`
                            : 'Pending allocation'}
                        </td>
                        <td>
                          {t.PAID_AMOUNT > 0
                            ? `₹${t.PAID_AMOUNT} paid`
                            : 'Not paid'}
                        </td>
                        <td>
                          {t.STATUS === 'CFM' &&
                          t.PERSON_ID === user.personId ? (
                            <Button
                              variant="danger"
                              disabled={busy}
                              onClick={() => void action('cancel', t.PNR)}
                            >
                              Cancel confirmed ticket
                            </Button>
                          ) : t.STATUS === 'CFM' ? (
                            'This passenger can cancel after signing in'
                          ) : (
                            'Waiting for promotion'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-sm text-muted">
              This shared board shows active practice tickets from both
              passengers. Cancelled records remain in My bookings for history.
              The board refreshes automatically.
            </p>
          </Card>
          <Card title="3. Start a fresh demonstration">
            <Note>
              Reset cancels all active tickets on this practice train only,
              including another demo passenger’s practice tickets. Normal train
              tickets and audit history are preserved.
            </Note>
            {hasRole('passenger', 'super_admin') ? (
              <div className="mt-3">
                {resetOpen ? (
                  <div className="flex gap-3">
                    <Button
                      variant="danger"
                      disabled={busy}
                      onClick={() => void action('reset')}
                    >
                      Confirm reset of this practice train
                    </Button>
                    <Button variant="ghost" onClick={() => setResetOpen(false)}>
                      Keep tickets
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setResetOpen(true)}
                  >
                    Reset practice train to 2 free seats
                  </Button>
                )}
              </div>
            ) : null}
          </Card>
        </>
      ) : !error ? (
        <Note>Loading the dedicated practice journey…</Note>
      ) : null}
      <Card title="What to say while presenting">
        <ul className="list-disc space-y-2 pl-5 text-sm">
          <li>
            <strong>Oracle:</strong> stores passengers, seats, bookings and
            payments. <strong>Redis:</strong> caches reference data.{' '}
            <strong>MongoDB:</strong> stores sensor readings.
          </li>
          <li>
            <strong>Booking:</strong> a PL/SQL procedure calculates the fare
            using a function, locks inventory and allocates the ticket.
          </li>
          <li>
            <strong>Cancellation:</strong> another procedure cancels the ticket
            and promotes the queue in one transaction.
          </li>
          <li>
            <strong>Triggers:</strong> audit inserts automatically produce
            outbox events. View them in the super-admin dashboard.
          </li>
          <li>
            <strong>Next actors:</strong> TTE boards passengers; station master
            publishes notices; zone admin sees its zone; super admin sees all
            zones.
          </li>
        </ul>
      </Card>
    </div>
  )
}
