import { Router, type NextFunction, type Request, type Response } from 'express'
import {
  requireAuth,
  requireRole,
  type AuthedRequest,
} from '../middleware/auth'
import { staffScope } from './operations'
import { z } from 'zod'
import { withZoneConnection } from '../../db/zoneRouter'
import {
  ingestReading,
  resolveZone,
  UnknownZoneError,
} from '../../iot/iotService'

// IoT REST surface (Phase 7). Every call is scoped to a zone because sensor
// readings and alerts are fragmented with the coach inventory.

export const iotRouter = Router()

type Handler = (req: Request, res: Response) => Promise<void>
const wrap =
  (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next)
  }

async function queryZone<T>(
  zoneCode: string,
  sql: string,
  binds: unknown[] = [],
): Promise<T[]> {
  const zone = resolveZone(zoneCode)
  const { default: oracledb } = await import('oracledb')
  return withZoneConnection(zone, async (conn) => {
    const res = await conn.execute<{ rows?: T[] }>(
      sql,
      Object.fromEntries(binds.map((v, i) => [String(i + 1), v])),
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    )
    return res.rows ?? []
  })
}

iotRouter.use(
  requireAuth,
  requireRole('tte', 'station_master', 'zone_admin', 'super_admin'),
)
iotRouter.use((req, res, next) => {
  staffScope((req as AuthedRequest).user!)
    .then((scope) => {
      const code = String(req.query.zoneCode ?? req.body?.zoneCode ?? '')
      if (scope.zoneId && ['NR', 'WR', 'SR'][scope.zoneId - 1] !== code) {
        res
          .status(403)
          .json({ message: 'This zone is outside your staff assignment' })
        return
      }
      next()
    })
    .catch(next)
})
const zoneQuery = z.object({ zoneCode: z.string().min(1) })

const readingSchema = z.object({
  zoneCode: z.string().min(1),
  sensorId: z.coerce.number().int().positive(),
  value: z.coerce.number(),
})

iotRouter.post(
  '/readings',
  wrap(async (req, res) => {
    const parsed = readingSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ code: 'BAD_REQUEST', issues: parsed.error.issues })
      return
    }
    try {
      const result = await ingestReading(parsed.data)
      res.status(201).json(result)
    } catch (err) {
      if (err instanceof UnknownZoneError) {
        res.status(400).json({ code: 'UNKNOWN_ZONE', message: err.message })
        return
      }
      throw err
    }
  }),
)

iotRouter.get(
  '/sensors',
  wrap(async (req, res) => {
    const parsed = zoneQuery.safeParse(req.query)
    if (!parsed.success) {
      res
        .status(400)
        .json({ code: 'BAD_REQUEST', message: 'zoneCode required' })
      return
    }
    const coachId = req.query.coachId ? Number(req.query.coachId) : null
    const rows = await queryZone(
      parsed.data.zoneCode,
      `SELECT * FROM (SELECT i.sensor_id,i.coach_id,i.sensor_code,i.sensor_kind,i.unit,i.min_value,i.max_value,i.active,c.coach_no,t.train_name
         FROM iot_sensor i JOIN coach c ON c.coach_id=i.coach_id JOIN train_schedule s ON s.schedule_id=c.schedule_id
         JOIN train t ON t.train_id=s.train_id WHERE (:1 IS NULL OR i.coach_id=:1) AND i.active='Y'
         ORDER BY CASE WHEN s.journey_date=DATE '2026-10-20' THEN 0 ELSE 1 END,i.sensor_kind,i.sensor_id) WHERE ROWNUM<=80`,
      [coachId],
    )
    res.json({ sensors: rows })
  }),
)

iotRouter.get(
  '/sensors/:sensorId/latest',
  wrap(async (req, res) => {
    const parsed = zoneQuery.safeParse(req.query)
    if (!parsed.success) {
      res
        .status(400)
        .json({ code: 'BAD_REQUEST', message: 'zoneCode required' })
      return
    }
    const sensorId = Number(req.params.sensorId)
    const rows = await queryZone(
      parsed.data.zoneCode,
      `SELECT reading_id, sensor_id, reading_time, value, status
         FROM (SELECT reading_id, sensor_id, reading_time, value, status
                 FROM sensor_reading
                WHERE sensor_id = :1
                ORDER BY reading_time DESC)
        WHERE ROWNUM = 1`,
      [sensorId],
    )
    if (rows.length === 0) {
      res
        .status(404)
        .json({
          code: 'NO_READINGS',
          message: `no readings for sensor ${sensorId}`,
        })
      return
    }
    res.json({ latest: rows[0] })
  }),
)

iotRouter.get(
  '/alerts',
  wrap(async (req, res) => {
    const parsed = zoneQuery.safeParse(req.query)
    if (!parsed.success) {
      res
        .status(400)
        .json({ code: 'BAD_REQUEST', message: 'zoneCode required' })
      return
    }
    const rows = await queryZone(
      parsed.data.zoneCode,
      `SELECT a.alert_id,a.sensor_id,i.sensor_kind,i.coach_id,a.reading_id,a.severity,a.status,a.message,a.raised_at
         FROM sensor_alert a JOIN iot_sensor i ON i.sensor_id=a.sensor_id WHERE a.status='OPEN' ORDER BY a.raised_at DESC`,
    )
    res.json({ alerts: rows })
  }),
)

iotRouter.post(
  '/alerts/:alertId/ack',
  wrap(async (req, res) => {
    const parsed = z
      .object({ zoneCode: z.string().min(1), actor: z.string().min(1) })
      .safeParse(req.body)
    if (!parsed.success) {
      res
        .status(400)
        .json({ code: 'BAD_REQUEST', message: 'zoneCode and actor required' })
      return
    }
    const alertId = Number(req.params.alertId)
    const { default: oracledb } = await import('oracledb')
    const zone = resolveZone(parsed.data.zoneCode)
    const message = await withZoneConnection(zone, async (conn) => {
      const result = await conn.execute<{ outBinds?: Array<string | null> }>(
        'BEGIN pkg_iot.acknowledge_alert(:id, :actor, :msg); END;',
        [
          alertId,
          String((req as AuthedRequest).user!.sub),
          { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 300 },
        ],
      )
      return result.outBinds?.[0] ?? null
    })
    res.json({ alertId, acknowledged: true, message })
  }),
)
