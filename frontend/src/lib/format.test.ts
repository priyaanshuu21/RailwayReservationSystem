import { describe, expect, it } from 'vitest'
import { formatFare, titleCase } from './format'

describe('formatFare', () => {
  it('formats with two decimals and rupee sign', () => {
    expect(formatFare(600)).toBe('₹600.00')
    expect(formatFare(123.4)).toBe('₹123.40')
  })
})

describe('titleCase', () => {
  it('title-cases each word', () => {
    expect(titleCase('EXPRESS')).toBe('Express')
    expect(titleCase('southbay city')).toBe('Southbay City')
  })
})
