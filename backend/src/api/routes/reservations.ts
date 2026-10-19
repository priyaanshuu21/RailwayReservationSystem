import { Router, type NextFunction, type Request, type Response } from 'express'
import { query } from '../../db/oracle'
import { staffScope } from './operations'
import { z } from 'zod'
import {
  requireAuth,
  requireRole,
  type AuthedRequest,
} from '../middleware/auth'
import {
  assertPaymentOwner,
  BadRequestError,
  NotFoundError,
  availability,
  boardTicket,
  book,
  cancel,
  findBooking,
  listScheduleTickets,
  pay,
  searchTrains,
} from '../../reservation/reservationService'
import { normalizeCoachClass } from '../../domain/ticket'

// Reservation REST surface (Phase 8). Search + availability are public; booking,
// payment, PNR and cancel require a logged-in passenger; TTE endpoints require
// the tte role.

export const reservationsRouter = Router()

function errorStatus(err: unknown): number {
  if (err instanceof NotFoundError) return 404
  if (err instanceof BadRequestError) return 400
  const message = err instanceof Error ? err.message : ''
  if (/ORA-20[0-9]{3}/.test(message)) return 409
  return 500
}

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch((err: unknown) => {
      const status = errorStatus(err)
      if (status === 500) {
        next(err)
        return
      }
      res
        .status(status)
        .json({
          code: status === 409 ? 'CONFLICT' : 'REQUEST_FAILED',
          message: (err as Error).message,
        })
    })
  }

const searchSchema = z.object({
  from: z.coerce.number().int().positive(),
  to: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

reservationsRouter.get(
  '/search',
  wrap(async (req, res) => {
    const parsed = searchSchema.safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ code: 'BAD_REQUEST', issues: parsed.error.issues })
      return
    }
    const { from, to, date } = parsed.data
    if (from === to) {
      res
        .status(400)
        .json({ code: 'BAD_REQUEST', message: 'from and to must differ' })
      return
    }
    const trains = await searchTrains(from, to, date)
    res.json({ from, to, date, trains })
  }),
)

reservationsRouter.get(
  '/schedules/:scheduleId/availability',
  wrap(async (req, res) => {
    const scheduleId = Number(req.params.scheduleId)
    const coachClass = normalizeCoachClass(String(req.query.coachClass ?? ''))
    if (!Number.isFinite(scheduleId) || !coachClass) {
      res
        .status(400)
        .json({
          code: 'BAD_REQUEST',
          message: 'scheduleId and coachClass required',
        })
      return
    }
    res.json(await availability(scheduleId, coachClass))
  }),
)

const bookSchema = z.object({
  scheduleId: z.coerce.number().int().positive(),
  fromStop: z.coerce.number().int().positive(),
  toStop: z.coerce.number().int().positive(),
  coachClass: z.string().min(1),
  requestId: z.string().min(6).max(40).optional(),
  berthPreference: z.enum(['LB', 'MB', 'UB', 'SL', 'SU']).optional(),
})

reservationsRouter.post(
  '/bookings',
  requireAuth,
  requireRole('passenger'),
  wrap(async (req, res) => {
    const parsed = bookSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ code: 'BAD_REQUEST', issues: parsed.error.issues })
      return
    }
    const user = (req as AuthedRequest).user
    const result = await book({
      ...parsed.data,
      coachClass: normalizeCoachClass(parsed.data.coachClass),
      passengerId: Number(user?.sub),
      requestId:
        parsed.data.requestId ??
        `WEB-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    })
    res.status(201).json(result)
  }),
)

const paySchema = z.object({
  zoneCode: z.string().min(1),
  bookingId: z.coerce.number().int().positive(),
  method: z.enum(['U', 'C', 'W']),
  amount: z.coerce.number().positive(),
  providerRef: z.string().min(1).max(40),
  requestId: z.string().min(1).max(40),
  upiHandle: z.string().min(1).max(60).optional(),
  maskedPan: z.string().optional(),
  cardScheme: z.string().optional(),
  walletProvider: z.string().min(1).max(30).optional(),
  walletTxn: z.string().min(1).max(40).optional(),
})

reservationsRouter.post(
  '/payments',
  requireAuth,
  requireRole('passenger'),
  wrap(async (req, res) => {
    const parsed = paySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ code: 'BAD_REQUEST', issues: parsed.error.issues })
      return
    }
    await assertPaymentOwner(
      parsed.data.zoneCode,
      parsed.data.bookingId,
      Number((req as AuthedRequest).user?.sub),
    )
    res.status(201).json(await pay(parsed.data))
  }),
)

reservationsRouter.get(
  '/bookings/:pnr',
  requireAuth,
  wrap(async (req, res) => {
    const booking = await findBooking(String(req.params.pnr).toUpperCase())
    const user = (req as AuthedRequest).user!
    if (
      user.roles.includes('passenger') &&
      booking.personId !== Number(user.sub)
    ) {
      res
        .status(403)
        .json({ message: 'This booking belongs to another passenger' })
      return
    }
    res.json(booking)
  }),
)

reservationsRouter.post(
  '/bookings/:pnr/cancel',
  requireAuth,
  requireRole('passenger'),
  wrap(async (req, res) => {
    const booking = await findBooking(String(req.params.pnr).toUpperCase())
    if (booking.personId !== Number((req as AuthedRequest).user?.sub)) {
      res
        .status(403)
        .json({ message: 'This booking belongs to another passenger' })
      return
    }
    const zoneCode =
      typeof req.body?.zoneCode === 'string' ? req.body.zoneCode : undefined
    res.json(await cancel(String(req.params.pnr).toUpperCase(), zoneCode))
  }),
)

reservationsRouter.get(
  '/tte/schedules/:scheduleId/passengers',
  requireAuth,
  requireRole('tte', 'super_admin'),
  wrap(async (req, res) => {
    const scheduleId = Number(req.params.scheduleId)
    const scope = await staffScope((req as AuthedRequest).user!)
    const rows = await query<{ ZONE_ID: number }>(
      'SELECT zone_id FROM train_schedule WHERE schedule_id=:1',
      [scheduleId],
    )
    if (scope.zoneId && scope.zoneId !== rows[0]?.ZONE_ID) {
      res
        .status(403)
        .json({ message: 'Journey is outside your TTE assignment' })
      return
    }
    res.json({ scheduleId, tickets: await listScheduleTickets(scheduleId) })
  }),
)

reservationsRouter.post(
  '/tte/board',
  requireAuth,
  requireRole('tte', 'super_admin'),
  wrap(async (req, res) => {
    const parsed = z
      .object({ pnr: z.string().min(1), zoneCode: z.string().min(1) })
      .safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json({ code: 'BAD_REQUEST', message: 'pnr and zoneCode required' })
      return
    }
    const scope = await staffScope((req as AuthedRequest).user!)
    if (
      scope.zoneId &&
      ['NR', 'WR', 'SR'][scope.zoneId - 1] !== parsed.data.zoneCode
    ) {
      res
        .status(403)
        .json({ message: 'Journey is outside your TTE assignment' })
      return
    }
    const message = await boardTicket(
      parsed.data.pnr.toUpperCase(),
      parsed.data.zoneCode,
    )
    res.json({ pnr: parsed.data.pnr, message })
  }),
)
