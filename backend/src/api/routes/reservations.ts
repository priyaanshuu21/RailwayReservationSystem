import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth'
import {
  BadRequestError,
  NotFoundError,
  availability,
  boardTicket,
  book,
  cancel,
  findBooking,
  listScheduleTickets,
  pay,
  searchTrains
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
  if (/ORA-20(05[0-9]|07[0-9]|08[0-9])/.test(message)) return 409
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
      res.status(status).json({ code: status === 409 ? 'CONFLICT' : 'REQUEST_FAILED', message: (err as Error).message })
    })
  }

const searchSchema = z.object({
  from: z.coerce.number().int().positive(),
  to: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
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
      res.status(400).json({ code: 'BAD_REQUEST', message: 'from and to must differ' })
      return
    }
    const trains = await searchTrains(from, to, date)
    res.json({ from, to, date, trains })
  })
)

reservationsRouter.get(
  '/schedules/:scheduleId/availability',
  wrap(async (req, res) => {
    const scheduleId = Number(req.params.scheduleId)
    const coachClass = normalizeCoachClass(String(req.query.coachClass ?? ''))
    if (!Number.isFinite(scheduleId) || !coachClass) {
      res.status(400).json({ code: 'BAD_REQUEST', message: 'scheduleId and coachClass required' })
      return
    }
    res.json(await availability(scheduleId, coachClass))
  })
)

const bookSchema = z.object({
  scheduleId: z.coerce.number().int().positive(),
  fromStop: z.coerce.number().int().positive(),
  toStop: z.coerce.number().int().positive(),
  coachClass: z.string().min(1),
  requestId: z.string().min(6).max(40).optional(),
  fare: z.coerce.number().nonnegative().optional()
})

reservationsRouter.post(
  '/bookings',
  requireAuth,
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
        parsed.data.requestId ?? `WEB-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
    })
    res.status(201).json(result)
  })
)

const paySchema = z.object({
  zoneCode: z.string().min(1),
  bookingId: z.coerce.number().int().positive(),
  method: z.enum(['U', 'C', 'W']),
  amount: z.coerce.number().positive(),
  providerRef: z.string().min(1),
  requestId: z.string().min(1),
  upiHandle: z.string().optional(),
  maskedPan: z.string().optional(),
  cardScheme: z.string().optional(),
  walletProvider: z.string().optional(),
  walletTxn: z.string().optional()
})

reservationsRouter.post(
  '/payments',
  requireAuth,
  wrap(async (req, res) => {
    const parsed = paySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ code: 'BAD_REQUEST', issues: parsed.error.issues })
      return
    }
    res.status(201).json(await pay(parsed.data))
  })
)

reservationsRouter.get(
  '/bookings/:pnr',
  requireAuth,
  wrap(async (req, res) => {
    res.json(await findBooking(String(req.params.pnr).toUpperCase()))
  })
)

reservationsRouter.post(
  '/bookings/:pnr/cancel',
  requireAuth,
  wrap(async (req, res) => {
    const zoneCode = typeof req.body?.zoneCode === 'string' ? req.body.zoneCode : undefined
    res.json(await cancel(String(req.params.pnr).toUpperCase(), zoneCode))
  })
)

reservationsRouter.get(
  '/tte/schedules/:scheduleId/passengers',
  requireAuth,
  requireRole('tte', 'station_master', 'zone_admin', 'super_admin'),
  wrap(async (req, res) => {
    const scheduleId = Number(req.params.scheduleId)
    res.json({ scheduleId, tickets: await listScheduleTickets(scheduleId) })
  })
)

reservationsRouter.post(
  '/tte/board',
  requireAuth,
  requireRole('tte', 'station_master', 'zone_admin', 'super_admin'),
  wrap(async (req, res) => {
    const parsed = z
      .object({ pnr: z.string().min(1), zoneCode: z.string().min(1) })
      .safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ code: 'BAD_REQUEST', message: 'pnr and zoneCode required' })
      return
    }
    const message = await boardTicket(parsed.data.pnr.toUpperCase(), parsed.data.zoneCode)
    res.json({ pnr: parsed.data.pnr, message })
  })
)
