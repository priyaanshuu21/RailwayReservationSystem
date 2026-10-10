import { Router, type NextFunction, type Request, type Response } from 'express'
import { ZONES } from '../../db/zoneRouter'
import { query } from '../../db/oracle'
import { redisCache } from '../../cache/redis'
import { cacheKeys, CACHE_TTL } from '../../cache/keys'
import { computeFare } from '../../domain/fare'

// Read-only catalogue API (Phase 6). Metadata is Redis-cached with a short TTL;
// cache failures degrade silently to a direct Oracle read (see RedisCache).

export const metadataRouter = Router()

type Handler = (req: Request, res: Response) => Promise<void>
const wrap = (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next)
  }

interface StationRow {
  STATION_ID: number
  ZONE_ID: number
  STATION_CODE: string
  STATION_NAME: string
  CITY: string | null
  PLATFORM_COUNT: number | null
}
interface TrainRow {
  TRAIN_ID: number
  TRAIN_NO: string
  TRAIN_NAME: string
  TRAIN_TYPE: string
}
interface RouteStopRow {
  STOP_ORDER: number
  STATION_ID: number
  STATION_CODE: string
  STATION_NAME: string
  KM_FROM_ORIGIN: number | null
  ARRIVAL: string | null
  DEPARTURE: string | null
}
interface FareRuleRow {
  BASE_RATE_PER_KM: number
  MIN_FARE: number
  MAX_FARE: number
}

metadataRouter.get('/zones', (_req, res) => {
  res.json({ zones: ZONES })
})

metadataRouter.get(
  '/stations',
  wrap(async (_req, res) => {
    const cached = await redisCache.getJson<StationRow[]>(cacheKeys.stations)
    if (cached) {
      res.json({ stations: cached, source: 'cache' })
      return
    }
    const rows = await query<StationRow>(
      `SELECT station_id, zone_id, station_code, station_name, city, platform_count
         FROM station ORDER BY zone_id, station_code`
    )
    await redisCache.setJson(cacheKeys.stations, rows, CACHE_TTL.metadata)
    res.json({ stations: rows, source: 'oracle' })
  })
)

metadataRouter.get(
  '/trains',
  wrap(async (req, res) => {
    const type = typeof req.query.type === 'string' ? req.query.type.toUpperCase() : undefined
    const key = cacheKeys.trains(type)
    const cached = await redisCache.getJson<TrainRow[]>(key)
    if (cached) {
      res.json({ trains: cached, source: 'cache' })
      return
    }
    const rows = type
      ? await query<TrainRow>(
          `SELECT train_id, train_no, train_name, train_type
             FROM train WHERE active = 1 AND train_type = :1 ORDER BY train_no`,
          [type]
        )
      : await query<TrainRow>(
          `SELECT train_id, train_no, train_name, train_type
             FROM train WHERE active = 1 ORDER BY train_no`
        )
    await redisCache.setJson(key, rows, CACHE_TTL.metadata)
    res.json({ trains: rows, source: 'oracle' })
  })
)

metadataRouter.get(
  '/routes/:routeId',
  wrap(async (req, res) => {
    const routeId = Number(req.params.routeId)
    if (!Number.isFinite(routeId)) {
      res.status(400).json({ code: 'BAD_ROUTE_ID', message: 'routeId must be numeric' })
      return
    }
    const key = cacheKeys.route(routeId)
    const cached = await redisCache.getJson<RouteStopRow[]>(key)
    if (cached) {
      res.json({ routeId, stops: cached, source: 'cache' })
      return
    }
    const rows = await query<RouteStopRow>(
      `SELECT sr.stop_order, sr.station_id, st.station_code, st.station_name,
              sr.km_from_origin, sr.arrival, sr.departure
         FROM station_route sr JOIN station st ON st.station_id = sr.station_id
        WHERE sr.route_id = :1
        ORDER BY sr.stop_order`,
      [routeId]
    )
    await redisCache.setJson(key, rows, CACHE_TTL.metadata)
    res.json({ routeId, stops: rows, source: 'oracle' })
  })
)

metadataRouter.get(
  '/fares',
  wrap(async (req, res) => {
    const trainType = String(req.query.trainType ?? '').toUpperCase()
    const coachClass = String(req.query.coachClass ?? '').toUpperCase()
    const km = Number(req.query.km ?? 0)
    if (!trainType || !coachClass) {
      res.status(400).json({ code: 'BAD_REQUEST', message: 'trainType and coachClass required' })
      return
    }
    const key = cacheKeys.fare(trainType, coachClass)
    const row = (await redisCache.getJson<FareRuleRow>(key)) ??
      (await query<FareRuleRow>(
        `SELECT base_rate_per_km, min_fare, max_fare FROM fare_rule
          WHERE train_type = :1 AND coach_class = :2
            AND effective_from = (SELECT MAX(effective_from) FROM fare_rule
                                   WHERE train_type = :1 AND coach_class = :2
                                     AND effective_from <= SYSDATE)`,
        [trainType, coachClass]
      ))[0]
    if (!row) {
      res.status(404).json({ code: 'NO_FARE_RULE', message: `no fare rule for ${trainType}/${coachClass}` })
      return
    }
    await redisCache.setJson(key, row, CACHE_TTL.fare)

    const breakdown = computeFare(
      { baseRatePerKm: row.BASE_RATE_PER_KM, minFare: row.MIN_FARE, maxFare: row.MAX_FARE },
      km,
      trainType === 'S'
    )
    res.json({ trainType, coachClass, km, lines: breakdown.lines })
  })
)