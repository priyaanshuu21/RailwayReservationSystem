// Pure fare math (Phase 6) kept free of I/O so it is unit-testable and can be
// shared by the metadata API and (mirrored by) pkg_fare in the database.

export interface FareRule {
  baseRatePerKm: number
  minFare: number
  maxFare: number
}

export interface FareLine {
  component: string
  amount: number
}

export interface FareBreakdown {
  lines: FareLine[]
  total: number
}

export const SUPERFAST_SURCHARGE = 45

export function computeFare(rule: FareRule, distanceKm: number, superfast: boolean): FareBreakdown {
  const raw = rule.baseRatePerKm * Math.max(distanceKm, 0)
  const base = round2(Math.min(Math.max(raw, rule.minFare), rule.maxFare))
  const surcharge = superfast ? SUPERFAST_SURCHARGE : 0
  const total = round2(base + surcharge)
  return {
    lines: [
      { component: 'BASE FARE', amount: base },
      { component: 'SUPERFAST SURCHARGE', amount: surcharge },
      { component: 'TOTAL', amount: total }
    ],
    total
  }
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}