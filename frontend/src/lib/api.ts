// Typed API client for the RailNexus backend (Phase 9).

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

const TOKEN_KEY = 'rxn_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
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
    throw new ApiError(res.status, String(record.code ?? 'ERROR'), String(record.message ?? res.statusText))
  }
  return body as T
}

const post = <T>(path: string, payload?: unknown) =>
  request<T>(path, { method: 'POST', body: payload === undefined ? undefined : JSON.stringify(payload) })

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

export const api = {
  login: (email: string, password: string) =>
    post<{ token: string; user: AuthUser }>('/api/auth/login', { email, password }),
  me: () => request<{ user: AuthUser }>('/api/auth/me'),

  stations: () => request<{ stations: Station[] }>('/api/metadata/stations'),
  zones: () => request<{ zones: Array<{ code: string; zoneId: number }> }>('/api/metadata/zones'),

  search: (from: number, to: number, date: string) =>
    request<{ trains: SearchTrain[] }>(`/api/search?from=${from}&to=${to}&date=${date}`),

  availability: (scheduleId: number, coachClass: string) =>
    request<Availability>(
      `/api/schedules/${scheduleId}/availability?coachClass=${encodeURIComponent(coachClass)}`
    ),

  book: (payload: {
    scheduleId: number
    fromStop: number
    toStop: number
    coachClass: string
    requestId?: string
  }) => post<{ bookingId: number; pnr: string; status: string; zone: string; ticketId: number }>('/api/bookings', payload),

  pay: (payload: Record<string, unknown>) => post<{ paymentId: number; captured: boolean; zone: string }>('/api/payments', payload),

  booking: (pnr: string) => request<BookingView>(`/api/bookings/${pnr}`),

  cancel: (pnr: string, zoneCode?: string) =>
    post<{ refundAmount: number; zone: string }>(`/api/bookings/${pnr}/cancel`, { zoneCode }),

  schedulePassengers: (scheduleId: number) =>
    request<{ scheduleId: number; tickets: TteTicket[] }>(`/api/tte/schedules/${scheduleId}/passengers`),

  board: (pnr: string, zoneCode: string) => post<{ pnr: string; message: string }>('/api/tte/board', { pnr, zoneCode }),

  alerts: (zoneCode: string) => request<{ alerts: AlertRow[] }>(`/api/iot/alerts?zoneCode=${zoneCode}`),

  ingestReading: (zoneCode: string, sensorId: number, value: number) =>
    post<{ readingId: number; status: string; alertId: number | null }>('/api/iot/readings', {
      zoneCode,
      sensorId,
      value
    }),

  ackAlert: (zoneCode: string, alertId: number) =>
    post<{ message: string }>(`/api/iot/alerts/${alertId}/ack`, { zoneCode, actor: 'dashboard' })
}
