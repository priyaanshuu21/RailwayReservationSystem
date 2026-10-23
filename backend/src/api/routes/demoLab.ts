import { Router, type Request, type Response, type NextFunction } from 'express'
import { randomUUID } from 'node:crypto'
import { query } from '../../db/oracle'
import { ZONES, withZoneConnection } from '../../db/zoneRouter'
import {
  book,
  cancel,
  findBooking,
  availability,
  pay,
} from '../../reservation/reservationService'
import {
  requireAuth,
  requireRole,
  type AuthedRequest,
} from '../middleware/auth'

export const demoLabRouter = Router()
demoLabRouter.use(requireAuth)
const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch((error: unknown) => {
      if (error instanceof Error) {
        const code = (error as Error & { errorNum?: number }).errorNum
        res
          .status(code && code >= 20000 && code < 21000 ? 409 : 503)
          .json({ message: error.message.split('\n')[0] })
        return
      }
      next(error)
    })
  }
function scenario(req: Request) {
  return req.params.lab === 'wl'
    ? 20901001
    : req.params.lab === 'rac'
      ? 20901002
      : null
}
// Serialize practice operations per scenario, including reset. Normal bookings use
// the existing PL/SQL schedule/seat locks; no mock reservation results are generated.
const queues = new Map<number, Promise<unknown>>()
async function exclusive<T>(sid: number, fn: () => Promise<T>): Promise<T> {
  const prior = queues.get(sid) ?? Promise.resolve()
  const next = prior.catch(() => undefined).then(fn)
  queues.set(sid, next)
  try {
    return await next
  } finally {
    if (queues.get(sid) === next) queues.delete(sid)
  }
}
async function state(sid: number) {
  const metadata = await query<{ SCHEDULE_ID: number }>(
    'SELECT schedule_id FROM train_schedule WHERE schedule_id=:1 AND train_id IN (9001,9002)',
    [sid],
  )
  if (!metadata.length)
    throw new Error(
      'Practice journeys are not installed. Run npm run demo:prepare once, then restart the backend.',
    )
  const counts = await availability(sid, '1A')
  const inventory = await withZoneConnection(ZONES[0]!, async (conn) => {
    const db = (await import('oracledb')).default
    const r = await conn.execute<{ rows?: Record<string, unknown>[] }>(
      `SELECT b.booking_id,p.full_name AS passenger,t.pnr,t.status,
    c.coach_no,se.seat_no,ct.berth,NVL((SELECT SUM(amount) FROM payment WHERE booking_id=b.booking_id AND status='CAP'),0) AS paid_amount,
    b.fare_total,b.person_id FROM booking b JOIN ticket t ON t.booking_id=b.booking_id JOIN person p ON p.person_id=b.person_id
    LEFT JOIN confirmed_ticket ct ON ct.ticket_id=t.ticket_id LEFT JOIN coach c ON c.coach_id=ct.coach_id
    LEFT JOIN seat se ON se.seat_id=ct.seat_id WHERE b.schedule_id=:1 AND b.status='BOK' ORDER BY b.booking_id`,
      [sid],
      { outFormat: db.OUT_FORMAT_OBJECT },
    )
    const capacityResult = await conn.execute<{
      rows?: Array<{ CAPACITY: number }>
    }>(
      "SELECT COUNT(*) AS capacity FROM seat s JOIN coach c ON c.coach_id=s.coach_id WHERE c.schedule_id=:1 AND c.coach_class='1A'",
      [sid],
      { outFormat: db.OUT_FORMAT_OBJECT },
    )
    return {
      tickets: r.rows ?? [],
      capacity: Number(capacityResult.rows?.[0]?.CAPACITY ?? 0),
    }
  })
  const tickets = inventory.tickets
  if (inventory.capacity !== 2)
    throw new Error(
      'Practice inventory must contain exactly two seats. Run npm run demo:prepare before demonstrating.',
    )
  return {
    ...counts,
    date: '2026-10-28',
    capacity: inventory.capacity,
    confirmed: tickets.filter((t) => t.STATUS === 'CFM').length,
    racWaiting: tickets.filter((t) => t.STATUS === 'RAC').length,
    waitlisted: tickets.filter((t) => t.STATUS === 'WL').length,
    tickets,
  }
}
demoLabRouter.get(
  '/:lab',
  wrap(async (req, res) => {
    const sid = scenario(req)
    if (!sid) {
      res.status(404).json({ message: 'Unknown practice scenario' })
      return
    }
    res.json(await exclusive(sid, () => state(sid)))
  }),
)
demoLabRouter.post(
  '/:lab/book',
  requireRole('passenger'),
  wrap(async (req, res) => {
    const sid = scenario(req)
    if (!sid) {
      res.status(404).json({ message: 'Unknown practice scenario' })
      return
    }
    await exclusive(sid, async () => {
      const result = await book({
        passengerId: Number((req as AuthedRequest).user!.sub),
        scheduleId: sid,
        fromStop: 1,
        toStop: 6,
        coachClass: '1A',
        requestId: randomUUID(),
        berthPreference: 'LB',
      })
      const view = await findBooking(result.pnr)
      // The practice button includes the existing simulated payment procedure so a
      // subsequent cancellation can demonstrate a real refund-request row.
      if (result.status === 'CFM')
        await pay({
          zoneCode: 'NR',
          bookingId: result.bookingId,
          method: 'U',
          amount: view.fareTotal,
          providerRef: randomUUID(),
          requestId: randomUUID(),
          upiHandle: 'practice@upi',
        })
      res
        .status(201)
        .json({
          result,
          view: await findBooking(result.pnr),
          state: await state(sid),
        })
    })
  }),
)
demoLabRouter.post(
  '/:lab/cancel',
  requireRole('passenger'),
  wrap(async (req, res) => {
    const sid = scenario(req)
    if (!sid) {
      res.status(404).json({ message: 'Unknown practice scenario' })
      return
    }
    await exclusive(sid, async () => {
      const current = await state(sid)
      const target = current.tickets.find(
        (t) =>
          t.PNR === req.body?.pnr &&
          Number(t.PERSON_ID) === Number((req as AuthedRequest).user!.sub),
      )
      if (!target) {
        res
          .status(403)
          .json({ message: 'Choose your own active practice ticket' })
        return
      }
      const before = current.tickets.map((t) => ({
        pnr: t.PNR,
        status: t.STATUS,
      }))
      const refund = await cancel(String(target.PNR), 'NR')
      const after = await state(sid)
      const promoted = after.tickets.filter((t) =>
        before.some((b) => b.pnr === t.PNR && b.status !== t.STATUS),
      )
      res.json({
        cancelledPnr: target.PNR,
        refundAmount: refund.refundAmount,
        promoted,
        state: after,
      })
    })
  }),
)
// This deliberately shared classroom sandbox is resettable by a passenger or
// super-admin. The whitelist above confines cancellation to these two practice
// schedules; normal tickets and audit history are never deleted.
demoLabRouter.post(
  '/:lab/reset',
  requireRole('passenger', 'super_admin'),
  wrap(async (req, res) => {
    const sid = scenario(req)
    if (!sid) {
      res.status(404).json({ message: 'Unknown practice scenario' })
      return
    }
    await exclusive(sid, async () => {
      const current = await state(sid)
      for (const t of current.tickets) await cancel(String(t.PNR), 'NR')
      res.json({
        state: await state(sid),
        message:
          'Practice tickets cancelled; normal bookings and audit history preserved. Two seats are ready.',
      })
    })
  }),
)
