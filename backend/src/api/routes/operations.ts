import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { query, getSharedPool } from '../../db/oracle'
import { ZONES, withZoneConnection } from '../../db/zoneRouter'
import {
  requireAuth,
  requireRole,
  type AuthedRequest,
} from '../middleware/auth'
import type { TokenClaims } from '../../auth/tokens'

export const operationsRouter = Router()
const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next)
  }

export async function staffScope(
  user: TokenClaims,
): Promise<{ zoneId?: number; stationId?: number }> {
  if (user.roles.includes('super_admin')) return {}
  const table = user.roles.includes('zone_admin')
    ? 'zone_admin'
    : user.roles.includes('station_master')
      ? 'station_master'
      : 'tte_conductor'
  const rows = await query<{ ZONE_ID: number; STATION_ID?: number }>(
    `SELECT zone_id${table === 'station_master' ? ', station_id' : ''} FROM ${table} WHERE employee_id=:1`,
    [Number(user.sub)],
  )
  if (!rows[0]) throw new Error('Staff assignment is missing')
  return { zoneId: rows[0].ZONE_ID, stationId: rows[0].STATION_ID }
}

operationsRouter.get(
  '/demo',
  wrap(async (_req, res) => {
    const routes =
      await query(`SELECT t.train_no,t.train_name,o.station_name AS origin,d.station_name AS destination,
    r.origin_station,r.destination_station FROM train t JOIN train_route tr ON tr.train_id=t.train_id
    JOIN route r ON r.route_id=tr.route_id JOIN station o ON o.station_id=r.origin_station
    JOIN station d ON d.station_id=r.destination_station WHERE t.train_type<>'F' ORDER BY t.train_no`)
    res.json({ from: '2026-10-01', to: '2026-10-30', routes })
  }),
)

operationsRouter.get(
  '/operations/scope',
  requireAuth,
  requireRole('tte', 'station_master', 'zone_admin', 'super_admin'),
  wrap(async (req, res) => {
    res.json(await staffScope((req as AuthedRequest).user!))
  }),
)

operationsRouter.get(
  '/operations/schedules',
  requireAuth,
  requireRole('tte', 'station_master', 'zone_admin', 'super_admin'),
  wrap(async (req, res) => {
    const scope = await staffScope((req as AuthedRequest).user!)
    const rows = await query(
      `SELECT s.schedule_id,t.train_no,t.train_name,TO_CHAR(s.journey_date,'YYYY-MM-DD') AS journey_date,
    z.zone_code,s.zone_id FROM train_schedule s JOIN train t ON t.train_id=s.train_id JOIN zone z ON z.zone_id=s.zone_id
    WHERE s.journey_date BETWEEN DATE '2026-10-01' AND DATE '2026-10-30' AND t.train_type<>'F'
    AND (:1 IS NULL OR s.zone_id=:1) AND (:2 IS NULL OR EXISTS(SELECT 1 FROM station_route sr WHERE sr.route_id=s.route_id AND sr.station_id=:2)) ORDER BY CASE WHEN s.journey_date=DATE '2026-10-20' THEN 0 ELSE 1 END,s.journey_date,t.train_no`,
      [scope.zoneId ?? null, scope.stationId ?? null],
    )
    res.json({ schedules: rows })
  }),
)

operationsRouter.get(
  '/schedules/:id/classes',
  wrap(async (req, res) => {
    const rows = await query<{ ZONE_ID: number; TRAIN_ID: number; D: string }>(
      "SELECT zone_id,train_id,TO_CHAR(journey_date,'YYYY-MM-DD') D FROM train_schedule WHERE schedule_id=:1",
      [Number(req.params.id)],
    )
    const row = rows[0],
      zone = ZONES.find((z) => z.zoneId === row?.ZONE_ID)
    if (!zone) {
      res.status(404).json({ message: 'Schedule not found' })
      return
    }
    const classes = await withZoneConnection(zone, async (conn) => {
      const db = (await import('oracledb')).default
      const r = await conn.execute<{ rows?: Array<{ COACH_CLASS: string }> }>(
        `SELECT DISTINCT c.coach_class FROM coach c JOIN train_schedule s ON s.schedule_id=c.schedule_id
      WHERE s.train_id=:1 AND s.journey_date=TO_DATE(:2,'YYYY-MM-DD') ORDER BY c.coach_class`,
        [row!.TRAIN_ID, row!.D],
        { outFormat: db.OUT_FORMAT_OBJECT },
      )
      return r.rows?.map((c) => c.COACH_CLASS) ?? []
    })
    res.json({ classes })
  }),
)

operationsRouter.get(
  '/my/bookings',
  requireAuth,
  requireRole('passenger'),
  wrap(async (req, res) => {
    const lists = await Promise.all(
      ZONES.map((zone) =>
        withZoneConnection(zone, async (conn) => {
          const db = (await import('oracledb')).default
          const r = await conn.execute<{ rows?: unknown[] }>(
            `SELECT t.pnr,t.status,b.coach_class,b.fare_total,
      TO_CHAR(s.journey_date,'YYYY-MM-DD') AS journey_date,tr.train_name FROM booking b
      JOIN ticket t ON t.booking_id=b.booking_id JOIN train_schedule s ON s.schedule_id=b.schedule_id
      JOIN train tr ON tr.train_id=s.train_id WHERE b.person_id=:1 ORDER BY b.booked_at DESC`,
            [Number((req as AuthedRequest).user!.sub)],
            { outFormat: db.OUT_FORMAT_OBJECT },
          )
          return r.rows ?? []
        }),
      ),
    )
    res.json({ bookings: lists.flat() })
  }),
)

operationsRouter.get(
  '/announcements',
  wrap(async (req, res) => {
    const rows = await query(
      `SELECT a.announcement_id,a.station_id,s.station_name,a.message,p.full_name AS author,
    TO_CHAR(a.created_at,'YYYY-MM-DD HH24:MI') AS created_at FROM station_announcement a
    JOIN station s ON s.station_id=a.station_id JOIN person p ON p.person_id=a.created_by
    WHERE (a.active_until IS NULL OR a.active_until>SYSDATE) AND (:1 IS NULL OR a.station_id=:1)
    ORDER BY a.created_at DESC`,
      [req.query.stationId ? Number(req.query.stationId) : null],
    )
    res.json({ announcements: rows })
  }),
)

operationsRouter.post(
  '/announcements',
  requireAuth,
  requireRole('station_master', 'zone_admin', 'super_admin'),
  wrap(async (req, res) => {
    const parsed = z
      .object({
        stationId: z.number().int().positive(),
        message: z.string().trim().min(5).max(300),
        hours: z.number().int().min(1).max(720).default(24),
      })
      .safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json({
          message:
            'Choose a station, a message of 5–300 characters and 1–720 hours',
        })
      return
    }
    const scope = await staffScope((req as AuthedRequest).user!)
    const station = await query<{ ZONE_ID: number }>(
      'SELECT zone_id FROM station WHERE station_id=:1',
      [parsed.data.stationId],
    )
    if (
      (scope.stationId && scope.stationId !== parsed.data.stationId) ||
      (scope.zoneId && scope.zoneId !== station[0]?.ZONE_ID)
    ) {
      res
        .status(403)
        .json({ message: 'This station is outside your staff assignment' })
      return
    }
    const db = (await import('oracledb')).default,
      conn = await (await getSharedPool()).getConnection()
    try {
      const r = (await conn.execute(
        'BEGIN pkg_announcements.publish(:s,:m,:a,:h,:id); END;',
        [
          parsed.data.stationId,
          parsed.data.message,
          Number((req as AuthedRequest).user!.sub),
          parsed.data.hours,
          { dir: db.BIND_OUT, type: db.NUMBER },
        ],
      )) as { outBinds?: number[] }
      res.status(201).json({ announcementId: r.outBinds?.[0] })
    } finally {
      await conn.close()
    }
  }),
)

operationsRouter.get(
  '/admin/audit',
  requireAuth,
  requireRole('super_admin'),
  wrap(async (_req, res) => {
    const rows =
      await query(`SELECT * FROM (SELECT zone_code,booking_id,event_type,TO_CHAR(event_time,'YYYY-MM-DD HH24:MI:SS') AS event_time
    FROM vw_live_audit ORDER BY event_time DESC) WHERE ROWNUM<=40`)
    const announcements = await query(
      'SELECT COUNT(*) AS count FROM announcement_audit',
    )
    const outbox = await query(
      'SELECT zone_code,COUNT(*) AS event_count FROM vw_live_outbox GROUP BY zone_code',
    )
    res.json({ events: rows, announcementAudits: announcements[0], outbox })
  }),
)
