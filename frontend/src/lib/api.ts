// Typed API client for the RailNexus backend (Phase 9).

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

const TOKEN_KEY = 'rxn_token'

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY)
}
export function setToken(token: string | null): void {
  // Each tab keeps its own actor for simultaneous passenger/staff sessions.
  localStorage.removeItem(TOKEN_KEY)
  if (token) sessionStorage.setItem(TOKEN_KEY, token)
  else sessionStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers })
  const text = await res.text()
  const body = text ? (JSON.parse(text) as unknown) : null
  if (!res.ok) {
    const record = (body ?? {}) as Record<string, unknown>
    throw new ApiError(
      res.status,
      String(record.code ?? 'ERROR'),
      String(record.message ?? res.statusText),
    )
  }
  return body as T
}

const post = <T>(path: string, payload?: unknown) =>
  request<T>(path, {
    method: 'POST',
    body: payload === undefined ? undefined : JSON.stringify(payload),
  })

export interface AuthUser {
  personId: number
  fullName: string
  email: string
  personType: string
  roles: string[]
}

export interface Station {
  STATION_ID: number
  ZONE_ID: number
  STATION_CODE: string
  STATION_NAME: string
  CITY: string | null
}

export interface SearchTrain {
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

export interface Availability {
  scheduleId: number
  coachClass: string
  freeSeats: number
  racRemaining: number
  wlRemaining: number
  zone: string
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

export interface AlertRow {
  ALERT_ID: number
  SENSOR_ID: number
  SENSOR_KIND: string
  COACH_ID: number
  SEVERITY: string
  STATUS: string
  MESSAGE: string
  RAISED_AT: string
}

export interface TteTicket {
  PNR: string
  PASSENGER_NAME: string
  COACH_NO: string | null
  SEAT_NO: string | null
  BERTH: string | null
  STATUS: string
  BOARDING_STATUS: string | null
}

export interface RevenueDay {
  REVENUE_DATE: string
  BOOKING_COUNT: number
  REVENUE_TOTAL: number
}

export interface ZoneSummaryRow {
  ZONE_ID: number
  ZONE_CODE: string
  ZONE_NAME: string
  BOOKING_COUNT: number
  GROSS_FARE: number
  CONFIRMED_TICKETS: number
  WAITLISTED_TICKETS: number
}

export interface OccupancyRow {
  ZONE_ID: number
  SCHEDULE_ID: number
  COACH_CLASS: string
  SEAT_COUNT: number
  OCCUPIED_SEATS: number
  OCCUPANCY_PCT: number
}

export const api = {
  login: (email: string, password: string) =>
    post<{ token: string; user: AuthUser }>('/api/auth/login', {
      email,
      password,
    }),
  me: () => request<{ user: AuthUser }>('/api/auth/me'),

  stations: () => request<{ stations: Station[] }>('/api/metadata/stations'),
  zones: () =>
    request<{ zones: Array<{ code: string; zoneId: number }> }>(
      '/api/metadata/zones',
    ),

  search: (from: number, to: number, date: string) =>
    request<{ trains: SearchTrain[] }>(
      `/api/search?from=${from}&to=${to}&date=${date}`,
    ),

  availability: (scheduleId: number, coachClass: string) =>
    request<Availability>(
      `/api/schedules/${scheduleId}/availability?coachClass=${encodeURIComponent(coachClass)}`,
    ),

  book: (payload: {
    scheduleId: number
    fromStop: number
    toStop: number
    coachClass: string
    requestId?: string
    berthPreference?: string
  }) =>
    post<{
      bookingId: number
      pnr: string
      status: string
      zone: string
      ticketId: number
    }>('/api/bookings', payload),

  pay: (payload: Record<string, unknown>) =>
    post<{ paymentId: number; captured: boolean; zone: string }>(
      '/api/payments',
      payload,
    ),

  booking: (pnr: string) => request<BookingView>(`/api/bookings/${pnr}`),

  cancel: (pnr: string, zoneCode?: string) =>
    post<{ refundAmount: number; zone: string }>(
      `/api/bookings/${pnr}/cancel`,
      { zoneCode },
    ),

  schedulePassengers: (scheduleId: number) =>
    request<{ scheduleId: number; tickets: TteTicket[] }>(
      `/api/tte/schedules/${scheduleId}/passengers`,
    ),

  board: (pnr: string, zoneCode: string) =>
    post<{ pnr: string; message: string }>('/api/tte/board', { pnr, zoneCode }),

  alerts: (zoneCode: string) =>
    request<{ alerts: AlertRow[] }>(`/api/iot/alerts?zoneCode=${zoneCode}`),

  ingestReading: (zoneCode: string, sensorId: number, value: number) =>
    post<{ readingId: number; status: string; alertId: number | null }>(
      '/api/iot/readings',
      {
        zoneCode,
        sensorId,
        value,
      },
    ),

  ackAlert: (zoneCode: string, alertId: number) =>
    post<{ message: string }>(`/api/iot/alerts/${alertId}/ack`, {
      zoneCode,
      actor: 'dashboard',
    }),

  revenueDaily: (from?: string, to?: string) => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    const qs = params.toString()
    return request<{ days: RevenueDay[] }>(
      `/api/reporting/revenue${qs ? `?${qs}` : ''}`,
    )
  },

  zoneSummary: () =>
    request<{ zones: ZoneSummaryRow[] }>('/api/reporting/zones'),

  occupancy: (limit = 25) =>
    request<{ rows: OccupancyRow[] }>(
      `/api/reporting/occupancy?limit=${limit}`,
    ),
}

export interface DemoSchedule {
  SCHEDULE_ID: number
  TRAIN_NO: string
  TRAIN_NAME: string
  JOURNEY_DATE: string
  ZONE_CODE: string
  ZONE_ID: number
}
export interface Announcement {
  ANNOUNCEMENT_ID: number
  STATION_ID: number
  STATION_NAME: string
  MESSAGE: string
  AUTHOR: string
  CREATED_AT: string
}
export interface MyBooking {
  PNR: string
  STATUS: string
  COACH_CLASS: string
  FARE_TOTAL: number
  JOURNEY_DATE: string
  TRAIN_NAME: string
}
export interface Sensor {
  SENSOR_ID: number
  SENSOR_KIND: string
  COACH_NO: string
  TRAIN_NAME: string
  MIN_VALUE: number
  MAX_VALUE: number
  UNIT: string
}
export const demoApi = {
  schedules: () =>
    request<{ schedules: DemoSchedule[] }>('/api/operations/schedules'),
  scope: () =>
    request<{ zoneId?: number; stationId?: number }>('/api/operations/scope'),
  classes: (id: number) =>
    request<{ classes: string[] }>(`/api/schedules/${id}/classes`),
  bookings: () => request<{ bookings: MyBooking[] }>('/api/my/bookings'),
  announcements: () =>
    request<{ announcements: Announcement[] }>('/api/announcements'),
  publish: (stationId: number, message: string, hours: number) =>
    post<{ announcementId: number }>('/api/announcements', {
      stationId,
      message,
      hours,
    }),
  sensors: (zoneCode: string) =>
    request<{ sensors: Sensor[] }>(`/api/iot/sensors?zoneCode=${zoneCode}`),
  audit: () =>
    request<{
      events: Array<{
        ZONE_CODE: string
        BOOKING_ID: number
        EVENT_TYPE: string
        EVENT_TIME: string
      }>
      outbox: Array<{ ZONE_CODE: string; EVENT_COUNT: number }>
      announcementAudits: { COUNT: number }
    }>('/api/admin/audit'),
  refresh: () => post<{ refreshed: string }>('/api/reporting/refresh'),
}
