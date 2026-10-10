// Central cache-key builders and TTLs (Phase 6) so invalidation stays in one
// place and every producer/consumer agrees on the shape.

export const cacheKeys = {
  availability: (scheduleId: number, coachClass: string): string =>
    `rxn:avail:${scheduleId}:${coachClass}`,
  availabilityBySchedule: (scheduleId: number): string => `rxn:avail:${scheduleId}:`,
  stations: 'rxn:meta:stations',
  trains: (type?: string): string => `rxn:meta:trains:${type ?? 'all'}`,
  route: (routeId: number): string => `rxn:meta:route:${routeId}`,
  fare: (trainType: string, coachClass: string): string => `rxn:fare:${trainType}:${coachClass}`,
  bookingLock: (scheduleId: number, coachClass: string): string =>
    `rxn:lock:${scheduleId}:${coachClass}`
} as const

export const CACHE_TTL = {
  availability: 30,
  metadata: 300,
  fare: 3600,
  bookingLockMs: 5000
} as const