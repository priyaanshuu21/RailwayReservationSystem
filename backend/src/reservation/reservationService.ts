import { query } from '../db/oracle'
import { ZONES, withZoneConnection, zoneForCode, zoneForZoneId, type ZoneDefinition } from '../db/zoneRouter'

// Reservation service (Phase 8): search + availability + booking + payment +
// PNR + cancel against the zone that owns the schedule. All PL/SQL entry points
// are the Phase-3 packages; this layer only marshals binds and maps errors.

export class NotFoundError extends Error {
  readonly statusCode = 404
}
export class BadRequestError extends Error {
  readonly statusCode = 400
}

async function oracle() {
  return import('oracledb')
}

export function resolveZone(code: string): ZoneDefinition {
  const zone = zoneForCode(code)
  if (!zone) throw new BadRequestError(`unknown zone '${code}'`)
  return zone
}

async function zoneOfSchedule(scheduleId: number): Promise<ZoneDefinition> {
  const rows = await query<{ ZONE_ID: number }>(
    'SELECT zone_id FROM train_schedule WHERE schedule_id = :1',
    [scheduleId]
  )
  const zone = rows[0] ? zoneForZoneId(rows[0].ZONE_ID) : undefined
  if (!zone) throw new NotFoundError(`no zone owns schedule ${scheduleId}`)
  return zone
}

export interface SearchRow {
  SCHEDULE_ID: number
  TRAIN_ID: number
  TRAIN_NO: string
  TRAIN_NAME: string
  TRAIN_TYPE: string
  ROUTE_ID: number
  FROM_STOP: number
  TO_STOP: number
  DISTANCE_KM: number
  DEPARTURE_TIME: string
  ARRIVAL_TIME: string
  ZONE_ID: number
}

export async function searchTrains(
  fromStationId: number,
  toStationId: number,
  date: string
): Promise<SearchRow[]> {
  return query<SearchRow>(
    `SELECT s.schedule_id, t.train_id, t.train_no, t.train_name, t.train_type,
            r.route_id, fs.stop_order AS from_stop, ts.stop_order AS to_stop,
            ABS(ts.km_from_origin - fs.km_from_origin) AS distance_km,
            TO_CHAR(s.departure_time, 'YYYY-MM-DD HH24:MI') AS departure_time,
            TO_CHAR(s.arrival_time, 'YYYY-MM-DD HH24:MI') AS arrival_time,
            s.zone_id
       FROM station_route fs
       JOIN station_route ts ON ts.route_id = fs.route_id
       JOIN route r ON r.route_id = fs.route_id
       JOIN train_schedule s ON s.route_id = fs.route_id
       JOIN train t ON t.train_id = s.train_id
      WHERE fs.station_id = :1
        AND ts.station_id = :2
        AND fs.stop_order < ts.stop_order
        AND TRUNC(s.journey_date) = TO_DATE(:3, 'YYYY-MM-DD')
        AND s.status = 'ACTIVE'
      ORDER BY s.departure_time`,
    [fromStationId, toStationId, date]
  )
}

export interface Availability {
  scheduleId: number
  coachClass: string
  freeSeats: number
  racRemaining: number
  wlRemaining: number
  zone: string
}

export async function availability(scheduleId: number, coachClass: string): Promise<Availability> {
  const zone = await zoneOfSchedule(scheduleId)
  return withZoneConnection(zone, async (conn) => {
    const db = await oracle()
    const res = await conn.execute<{ outBinds?: Array<number> }>(
      'BEGIN pkg_booking.availability(:sid, :cls, :free, :rac, :wl); END;',
      [
        scheduleId,
        coachClass,
        { dir: db.BIND_OUT, type: db.NUMBER },
        { dir: db.BIND_OUT, type: db.NUMBER },
        { dir: db.BIND_OUT, type: db.NUMBER }
      ]
    )
    const out = res.outBinds ?? []
    return {
      scheduleId,
      coachClass,
      freeSeats: Number(out[2]),
      racRemaining: Number(out[3]),
      wlRemaining: Number(out[4]),
      zone: zone.code
    }
  })
}

export interface BookInput {
  passengerId: number
  scheduleId: number
  fromStop: number
  toStop: number
  coachClass: string
  requestId: string
  fare?: number
}

export interface BookResult {
  bookingId: number
  ticketId: number
  pnr: string
  status: string
  zone: string
}

export async function book(input: BookInput): Promise<BookResult> {
  const zone = await zoneOfSchedule(input.scheduleId)
  return withZoneConnection(zone, async (conn) => {
    const db = await oracle()
    const res = await conn.execute<{ outBinds?: Array<number | string | null> }>(
      `BEGIN pkg_booking.book_ticket(:pid, :sid, :froms, :tos, :cls, :req, :fare,
                                     :bid, :tid, :pnr, :st); END;`,
      [
        input.passengerId,
        input.scheduleId,
        input.fromStop,
        input.toStop,
        input.coachClass,
        input.requestId,
        input.fare ?? null,
        { dir: db.BIND_OUT, type: db.NUMBER },
        { dir: db.BIND_OUT, type: db.NUMBER },
        { dir: db.BIND_OUT, type: db.STRING, maxSize: 10 },
        { dir: db.BIND_OUT, type: db.STRING, maxSize: 4 }
      ]
    )
    const out = res.outBinds ?? []
    return {
      bookingId: Number(out[7]),
      ticketId: Number(out[8]),
      pnr: String(out[9]),
      status: String(out[10]),
      zone: zone.code
    }
  })
}

export interface PayInput {
  zoneCode: string
  bookingId: number
  method: 'U' | 'C' | 'W'
  amount: number
  providerRef: string
  requestId: string
  upiHandle?: string
  maskedPan?: string
  cardScheme?: string
  walletProvider?: string
  walletTxn?: string
}

export interface PayResult {
  paymentId: number
  captured: boolean
  zone: string
}

export async function pay(input: PayInput): Promise<PayResult> {
  const zone = resolveZone(input.zoneCode)
  return withZoneConnection(zone, async (conn) => {
    const db = await oracle()
    const rec = await conn.execute<{ outBinds?: Array<number | null> }>(
      `BEGIN pkg_payment.record_payment(:bid, :method, :amt, :pref, :req,
             :upi, :pan, :scheme, :wallet, :wtxn, :pid); END;`,
      [
        input.bookingId,
        input.method,
        input.amount,
        input.providerRef,
        input.requestId,
        input.upiHandle ?? null,
        input.maskedPan ?? null,
        input.cardScheme ?? null,
        input.walletProvider ?? null,
        input.walletTxn ?? null,
        { dir: db.BIND_OUT, type: db.NUMBER }
      ]
    )
    const paymentId = Number(rec.outBinds?.[10])
    await conn.execute('BEGIN pkg_payment.capture_payment(:pid); END;', [paymentId])
    return { paymentId, captured: true, zone: zone.code }
  })
}

export interface BookingView {
  bookingId: number
  bookingRef: string
  pnr: string
  passengerName: string
  email: string
  coachClass: string
  bookingStatus: string
  ticketStatus: string
  fareTotal: number
  fromStop: number
  toStop: number
  journeyDate: string
  trainId: number
  zoneCode: string
}

async function findInZone(zone: ZoneDefinition, pnr: string): Promise<BookingView | null> {
  return withZoneConnection(zone, async (conn) => {
    const db = await oracle()
    const res = await conn.execute<{ rows?: Record<string, unknown>[] }>(
      `SELECT b.booking_id, b.booking_ref, b.coach_class, b.status AS booking_status,
              b.fare_total, b.from_stop_order, b.to_stop_order,
              t.pnr, t.status AS ticket_status,
              TO_CHAR(s.journey_date, 'YYYY-MM-DD') AS journey_date, s.train_id,
              p.full_name, p.email
         FROM booking b
         JOIN ticket t ON t.booking_id = b.booking_id
         JOIN train_schedule s ON s.schedule_id = b.schedule_id
         JOIN person p ON p.person_id = b.person_id
        WHERE t.pnr = :1`,
      [pnr],
      { outFormat: db.OUT_FORMAT_OBJECT }
    )
    const row = res.rows?.[0]
    if (!row) return null
    return {
      bookingId: Number(row.booking_id),
      bookingRef: String(row.booking_ref),
      pnr: String(row.pnr),
      passengerName: String(row.full_name),
      email: String(row.email),
      coachClass: String(row.coach_class),
      bookingStatus: String(row.booking_status),
      ticketStatus: String(row.ticket_status),
      fareTotal: Number(row.fare_total),
      fromStop: Number(row.from_stop_order),
      toStop: Number(row.to_stop_order),
      journeyDate: String(row.journey_date),
      trainId: Number(row.train_id),
      zoneCode: zone.code
    }
  }).catch(() => null)
}

export async function findBooking(pnr: string): Promise<BookingView> {
  for (const zone of ZONES) {
    const found = await findInZone(zone, pnr)
    if (found) return found
  }
  throw new NotFoundError(`no booking found for PNR ${pnr}`)
}

export async function cancel(pnr: string, zoneCode?: string): Promise<{ refundAmount: number; zone: string }> {
  const booking = await findBooking(pnr)
  const zone = resolveZone(zoneCode ?? booking.zoneCode)
  return withZoneConnection(zone, async (conn) => {
    const db = await oracle()
    const res = await conn.execute<{ outBinds?: Array<number | null> }>(
      'BEGIN pkg_booking.cancel_ticket(:bid, :refund); END;',
      [booking.bookingId, { dir: db.BIND_OUT, type: db.NUMBER }]
    )
    return { refundAmount: Number(res.outBinds?.[1]), zone: zone.code }
  })
}

export interface TteRow {
  PNR: string
  PASSENGER_NAME: string
  COACH_NO: string | null
  SEAT_NO: string | null
  BERTH: string | null
  STATUS: string
  BOARDING_STATUS: string | null
}

export async function listScheduleTickets(scheduleId: number): Promise<TteRow[]> {
  const zone = await zoneOfSchedule(scheduleId)
  return withZoneConnection(zone, async (conn) => {
    const db = await oracle()
    const res = await conn.execute<{ rows?: TteRow[] }>(
      `SELECT t.pnr, p.full_name AS passenger_name, c.coach_no, se.seat_no,
              ct.berth, t.status, ct.boarding_status
         FROM ticket t
         JOIN booking b ON b.booking_id = t.booking_id
         JOIN person p ON p.person_id = b.person_id
         LEFT JOIN confirmed_ticket ct ON ct.ticket_id = t.ticket_id
         LEFT JOIN coach c ON c.coach_id = ct.coach_id
         LEFT JOIN seat se ON se.seat_id = ct.seat_id
        WHERE t.schedule_id = :1 AND t.status IN ('CFM', 'RAC')
        ORDER BY c.coach_no, se.seat_no`,
      [scheduleId],
      { outFormat: db.OUT_FORMAT_OBJECT }
    )
    return res.rows ?? []
  })
}

export async function boardTicket(pnr: string, zoneCode: string): Promise<string> {
  const zone = resolveZone(zoneCode)
  return withZoneConnection(zone, async (conn) => {
    const db = await oracle()
    const res = await conn.execute<{ outBinds?: Array<string | null> }>(
      'BEGIN pkg_tte.board_ticket(:pnr, :msg); END;',
      [pnr, { dir: db.BIND_OUT, type: db.STRING, maxSize: 200 }]
    )
    return res.outBinds?.[1] ?? `boarding confirmed for ${pnr}`
  })
}
