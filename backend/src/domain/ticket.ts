// Pure ticket/coach helpers (Phase 8) shared by the reservation API routes.

export const COACH_CLASSES = ['1A', '2A', '3A', 'SL', 'CC', '2S', 'FC'] as const
export type CoachClass = (typeof COACH_CLASSES)[number]

export type TicketStatus = 'CFM' | 'RAC' | 'WL' | 'CNL' | 'BKD'

const STATUS_LABELS: Record<TicketStatus, string> = {
  CFM: 'Confirmed',
  RAC: 'Reservation Against Cancellation',
  WL: 'Waitlisted',
  CNL: 'Cancelled',
  BKD: 'Booked (unpaid)'
}

export function normalizeCoachClass(value: string): string {
  return value.trim().toUpperCase()
}

export function isCoachClass(value: string): value is CoachClass {
  return (COACH_CLASSES as readonly string[]).includes(value)
}

export function isTicketStatus(value: string): value is TicketStatus {
  return value in STATUS_LABELS
}

export function ticketStatusLabel(value: string): string {
  return isTicketStatus(value) ? STATUS_LABELS[value] : value
}

export function makeRequestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`
}
