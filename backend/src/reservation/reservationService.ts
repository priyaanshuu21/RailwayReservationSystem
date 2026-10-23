import { query } from '../db/oracle'
import {
  ZONES,
  withZoneConnection,
  zoneForCode,
  zoneForZoneId,
  type ZoneDefinition,
} from '../db/zoneRouter'

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
  return (await import('oracledb')).default
}

export function resolveZone(code: string): ZoneDefinition {
  const zone = zoneForCode(code)
  if (!zone) throw new BadRequestError(`unknown zone '${code}'`)
  return zone
}

async function inventorySchedule(
  scheduleId: number,
): Promise<{ zone: ZoneDefinition; localId: number }> {
  const rows = await query<{
    ZONE_ID: number
    TRAIN_ID: number
    JOURNEY_DATE: string
  }>(
    "SELECT zone_id, train_id, TO_CHAR(journey_date,'YYYY-MM-DD') AS journey_date FROM train_schedule WHERE schedule_id = :1",
    [scheduleId],
  )
  const row = rows[0]
  const zone = row ? zoneForZoneId(row.ZONE_ID) : undefined
  if (!zone || !row) throw new NotFoundError(`No schedule ${scheduleId}`)
  return withZoneConnection(zone, async (conn) => {
    const db = await oracle()
    const result = await conn.execute<{
      rows?: Array<{ SCHEDULE_ID: number }>
    }>(
      "SELECT schedule_id FROM train_schedule WHERE train_id=:1 AND journey_date=TO_DATE(:2,'YYYY-MM-DD')",
      [row.TRAIN_ID, row.JOURNEY_DATE],
      { outFormat: db.OUT_FORMAT_OBJECT },
    )
    const localId = result.rows?.[0]?.SCHEDULE_ID
    if (!localId)
      throw new NotFoundError(
        'Inventory has not been prepared for this journey',
      )
    return { zone, localId }
  })
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
  date: string,
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
        AND s.status = 'ACTIVE' AND t.train_type <> 'F' AND t.train_id NOT IN (9001,9002)
      ORDER BY s.departure_time`,
    [fromStationId, toStationId, date],
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

export async function availability(
  scheduleId: number,
  coachClass: string,
): Promise<Availability> {
  const { zone, localId } = await inventorySchedule(scheduleId)
  return withZoneConnection(zone, async (conn) => {
    const db = await oracle()
    const res = await conn.execute<{ outBinds?: Array<number> }>(
      'BEGIN pkg_booking.availability(:sid, :cls, :free, :rac, :wl); END;',
      [
        localId,
        coachClass,
        { dir: db.BIND_OUT, type: db.NUMBER },
        { dir: db.BIND_OUT, type: db.NUMBER },
        { dir: db.BIND_OUT, type: db.NUMBER },
      ],
    )
    const out = res.outBinds ?? []
    return {
      scheduleId,
      coachClass,
      freeSeats: Number(out[0]),
      racRemaining: Number(out[1]),
      wlRemaining: Number(out[2]),
      zone: zone.code,
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
  berthPreference?: string
}

export interface BookResult {
  bookingId: number
  ticketId: number
  pnr: string
  status: string
  zone: string
}

export async function book(input: BookInput): Promise<BookResult> {
  const { zone, localId } = await inventorySchedule(input.scheduleId)
  return withZoneConnection(zone, async (conn) => {
    const db = await oracle()
    const res = await conn.execute<{
      outBinds?: Array<number | string | null>
    }>(
      `BEGIN pkg_booking.book_ticket(:pid, :sid, :froms, :tos, :cls, :req, :fare,
                                     :bid, :tid, :pnr, :st, :berth); END;`,
      [
        input.passengerId,
        localId,
        input.fromStop,
        input.toStop,
        input.coachClass,
        input.requestId,
        null,
        { dir: db.BIND_OUT, type: db.NUMBER },
        { dir: db.BIND_OUT, type: db.NUMBER },
        { dir: db.BIND_OUT, type: db.STRING, maxSize: 10 },
        { dir: db.BIND_OUT, type: db.STRING, maxSize: 4 },
        input.berthPreference ?? null,
      ],
    )
    const out = res.outBinds ?? []
    return {
      bookingId: Number(out[0]),
      ticketId: Number(out[1]),
      pnr: String(out[2]),
      status: String(out[3]),
      zone: zone.code,
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
        { dir: db.BIND_OUT, type: db.NUMBER },
      ],
    )
    const paymentId = Number(rec.outBinds?.[0])
    await conn.execute('BEGIN pkg_payment.capture_payment(:pid); END;', [
      paymentId,
    ])
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
  personId: number
  seatNo: string | null
  coachNo: string | null
  berth: string | null
  queuePosition: number | null
  paidAmount: number
}

async function findInZone(
  zone: ZoneDefinition,
  pnr: string,
): Promise<BookingView | null> {
  return withZoneConnection(zone, async (conn) => {
    const db = await oracle()
    const res = await conn.execute<{ rows?: Record<string, unknown>[] }>(
      `SELECT b.booking_id, b.booking_ref, b.coach_class, b.status AS booking_status,
              b.fare_total, b.from_stop_order, b.to_stop_order,
              t.pnr, t.status AS ticket_status,
              TO_CHAR(s.journey_date, 'YYYY-MM-DD') AS journey_date, s.train_id,
              p.full_name, p.email, b.person_id, se.seat_no, c.coach_no, ct.berth,
              (SELECT COUNT(*) FROM waitlist_queue q2 WHERE q2.schedule_id = b.schedule_id
                AND q2.coach_class = b.coach_class AND q2.queue_type=q.queue_type AND q2.position <= q.position) AS queue_position,
              NVL((SELECT SUM(amount) FROM payment WHERE booking_id = b.booking_id AND status = 'CAP'),0) AS paid_amount
         FROM booking b
         JOIN ticket t ON t.booking_id = b.booking_id
         JOIN train_schedule s ON s.schedule_id = b.schedule_id
         JOIN person p ON p.person_id = b.person_id
         LEFT JOIN confirmed_ticket ct ON ct.ticket_id = t.ticket_id
         LEFT JOIN seat se ON se.seat_id = ct.seat_id
         LEFT JOIN coach c ON c.coach_id = ct.coach_id
         LEFT JOIN waitlist_queue q ON q.ticket_id = t.ticket_id
        WHERE t.pnr = :1`,
      [pnr],
      { outFormat: db.OUT_FORMAT_OBJECT },
    )
    const row = res.rows?.[0]
    if (!row) return null
    return {
      bookingId: Number(row.BOOKING_ID),
      bookingRef: String(row.BOOKING_REF),
      pnr: String(row.PNR),
      passengerName: String(row.FULL_NAME),
      email: String(row.EMAIL),
      coachClass: String(row.COACH_CLASS),
      bookingStatus: String(row.BOOKING_STATUS),
      ticketStatus: String(row.TICKET_STATUS),
      fareTotal: Number(row.FARE_TOTAL),
      fromStop: Number(row.FROM_STOP_ORDER),
      toStop: Number(row.TO_STOP_ORDER),
      journeyDate: String(row.JOURNEY_DATE),
      trainId: Number(row.TRAIN_ID),
      zoneCode: zone.code,
      personId: Number(row.PERSON_ID),
      seatNo: row.SEAT_NO ? String(row.SEAT_NO) : null,
      coachNo: row.COACH_NO ? String(row.COACH_NO) : null,
      berth: row.BERTH ? String(row.BERTH) : null,
      queuePosition: row.QUEUE_POSITION ? Number(row.QUEUE_POSITION) : null,
      paidAmount: Number(row.PAID_AMOUNT),
    }
  })
}

export async function findBooking(pnr: string): Promise<BookingView> {
  for (const zone of ZONES) {
    const found = await findInZone(zone, pnr)
    if (found) return found
  }
  throw new NotFoundError(`no booking found for PNR ${pnr}`)
}

export async function cancel(
  pnr: string,
  zoneCode?: string,
): Promise<{ refundAmount: number; zone: string }> {
  const booking = await findBooking(pnr)
  if (zoneCode && zoneCode !== booking.zoneCode)
    throw new BadRequestError('Booking belongs to another zone')
  const zone = resolveZone(booking.zoneCode)
  return withZoneConnection(zone, async (conn) => {
    const db = await oracle()
    const res = await conn.execute<{ outBinds?: Array<number | null> }>(
      'BEGIN pkg_booking.cancel_ticket(:bid, :refund); END;',
      [booking.bookingId, { dir: db.BIND_OUT, type: db.NUMBER }],
    )
    return { refundAmount: Number(res.outBinds?.[0]), zone: zone.code }
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

export async function listScheduleTickets(
  scheduleId: number,
): Promise<TteRow[]> {
  const { zone, localId } = await inventorySchedule(scheduleId)
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
      [localId],
      { outFormat: db.OUT_FORMAT_OBJECT },
    )
    return res.rows ?? []
  })
}

export async function boardTicket(
  pnr: string,
  zoneCode: string,
): Promise<string> {
  const zone = resolveZone(zoneCode)
  return withZoneConnection(zone, async (conn) => {
    const db = await oracle()
    const res = await conn.execute<{ outBinds?: Array<string | null> }>(
      'BEGIN pkg_tte.board_ticket(:pnr, :msg); END;',
      [pnr, { dir: db.BIND_OUT, type: db.STRING, maxSize: 200 }],
    )
    return res.outBinds?.[0] ?? `boarding confirmed for ${pnr}`
  })
}

export async function assertPaymentOwner(
  zoneCode: string,
  bookingId: number,
  personId: number,
): Promise<void> {
  const zone = resolveZone(zoneCode)
  await withZoneConnection(zone, async (conn) => {
    const db = await oracle()
    const r = await conn.execute<{ rows?: Array<{ PERSON_ID: number }> }>(
      'SELECT person_id FROM booking WHERE booking_id=:1',
      [bookingId],
      { outFormat: db.OUT_FORMAT_OBJECT },
    )
    if (r.rows?.[0]?.PERSON_ID !== personId)
      throw new BadRequestError('This booking belongs to another passenger')
  })
}
