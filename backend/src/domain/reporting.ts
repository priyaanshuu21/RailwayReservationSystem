// Pure reporting helpers (Phase 10): occupancy math and simple trend summaries
// used by the analytics endpoints and unit-tested without a database.

export function occupancyRate(occupied: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((occupied / total) * 10000) / 100
}

export interface TrendSummary {
  count: number
  total: number
  average: number
  min: number
  max: number
}

export function summariseTrend(values: number[]): TrendSummary {
  if (values.length === 0) {
    return { count: 0, total: 0, average: 0, min: 0, max: 0 }
  }
  const total = values.reduce((sum, v) => sum + v, 0)
  return {
    count: values.length,
    total: Math.round(total * 100) / 100,
    average: Math.round((total / values.length) * 100) / 100,
    min: Math.min(...values),
    max: Math.max(...values)
  }
}
