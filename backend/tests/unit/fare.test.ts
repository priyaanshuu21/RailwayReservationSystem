import { computeFare, round2, SUPERFAST_SURCHARGE } from '../../src/domain/fare'

describe('computeFare', () => {
  const rule = { baseRatePerKm: 1.2, minFare: 100, maxFare: 2500 }

  it('computes a normal banded fare', () => {
    const { total, lines } = computeFare(rule, 500, false)
    expect(total).toBe(600)
    expect(lines.map((l) => l.component)).toEqual(['BASE FARE', 'SUPERFAST SURCHARGE', 'TOTAL'])
  })

  it('clamps below the minimum fare', () => {
    expect(computeFare(rule, 10, false).total).toBe(100)
  })

  it('clamps above the maximum fare', () => {
    expect(computeFare(rule, 100000, false).total).toBe(2500)
  })

  it('adds the superfast surcharge for S trains', () => {
    expect(computeFare(rule, 500, true).total).toBe(600 + SUPERFAST_SURCHARGE)
  })

  it('treats negative distance as zero', () => {
    expect(computeFare(rule, -50, false).total).toBe(100)
  })
})

describe('round2', () => {
  it('rounds to two decimals', () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(2.344)).toBe(2.34)
  })
})
