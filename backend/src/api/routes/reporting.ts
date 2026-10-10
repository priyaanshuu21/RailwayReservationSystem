import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { requireAuth, requireRole } from '../middleware/auth'
import {
  occupancy,
  refreshMaterialized,
  revenueByTrain,
  revenueDaily,
  routePopularity,
  telemetryBySensor,
  waitlistPressure,
  zoneSummary
} from '../../reporting/reportingService'

// Reporting / analytics REST surface (Phase 10). Read endpoints are public
// (aggregate, non-personal data); the materialized-view refresh is restricted to
// administrative roles.
export const reportingRouter = Router()

type Handler = (req: Request, res: Response) => Promise<void>
const wrap =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next)
  }

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

reportingRouter.get(
  '/revenue',
  wrap(async (req, res) => {
    const parsed = z
      .object({ from: dateString.optional(), to: dateString.optional() })
      .safeParse(req.query)
    if (!parsed.success) {
      res.status(400).json({ code: 'BAD_REQUEST', message: 'from/to must be YYYY-MM-DD' })
      return
    }
    res.json({ days: await revenueDaily(parsed.data.from, parsed.data.to) })
  })
)

reportingRouter.get(
  '/revenue/by-train',
  wrap(async (_req, res) => {
    res.json({ rows: await revenueByTrain() })
  })
)

reportingRouter.get(
  '/zones',
  wrap(async (_req, res) => {
    res.json({ zones: await zoneSummary() })
  })
)

reportingRouter.get(
  '/occupancy',
  wrap(async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 50
    res.json({ rows: await occupancy(Number.isFinite(limit) ? limit : 50) })
  })
)

reportingRouter.get(
  '/waitlist',
  wrap(async (_req, res) => {
    res.json({ rows: await waitlistPressure() })
  })
)

reportingRouter.get(
  '/routes',
  wrap(async (_req, res) => {
    res.json({ routes: await routePopularity() })
  })
)

reportingRouter.get(
  '/telemetry',
  wrap(async (req, res) => {
    const zoneCode = String(req.query.zoneCode ?? '').trim()
    if (!zoneCode) {
      res.status(400).json({ code: 'BAD_REQUEST', message: 'zoneCode required' })
      return
    }
    res.json({ buckets: await telemetryBySensor(zoneCode) })
  })
)

reportingRouter.post(
  '/refresh',
  requireAuth,
  requireRole('zone_admin', 'super_admin'),
  wrap(async (_req, res) => {
    res.json({ refreshed: await refreshMaterialized() })
  })
)
