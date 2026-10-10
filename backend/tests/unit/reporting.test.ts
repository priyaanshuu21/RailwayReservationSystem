import { occupancyRate, summariseTrend } from '../../src/domain/reporting'

describe('occupancyRate', () => {
  it('computes a rounded percentage', () => {
    expect(occupancyRate(45, 60)).toBe(75)
    expect(occupancyRate(1, 3)).toBe(33.33)
  })

  it('returns zero when there are no seats', () => {
    expect(occupancyRate(5, 0)).toBe(0)
  })
})

describe('summariseTrend', () => {
  it('summarises a non-empty series', () => {
    const summary = summariseTrend([100, 200, 300])
    expect(summary).toEqual({ count: 3, total: 600, average: 200, min: 100, max: 300 })
  })

  it('handles an empty series', () => {
    expect(summariseTrend([])).toEqual({ count: 0, total: 0, average: 0, min: 0, max: 0 })
  })
})
