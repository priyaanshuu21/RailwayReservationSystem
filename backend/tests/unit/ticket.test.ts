import {
  COACH_CLASSES,
  isCoachClass,
  normalizeCoachClass,
  ticketStatusLabel
} from '../../src/domain/ticket'

describe('coach classes', () => {
  it('accepts known classes and normalises case/space', () => {
    expect(isCoachClass('3A')).toBe(true)
    expect(isCoachClass(' 2a'.trim())).toBe(false)
    expect(normalizeCoachClass(' 2a ')).toBe('2A')
    expect(isCoachClass(normalizeCoachClass('sl'))).toBe(true)
  })

  it('rejects unknown classes', () => {
    expect(isCoachClass('XX')).toBe(false)
    expect(COACH_CLASSES).toContain('1A')
  })
})

describe('ticketStatusLabel', () => {
  it('maps known statuses to human labels', () => {
    expect(ticketStatusLabel('CFM')).toBe('Confirmed')
    expect(ticketStatusLabel('RAC')).toBe('Reservation Against Cancellation')
    expect(ticketStatusLabel('WL')).toBe('Waitlisted')
  })

  it('echoes unknown statuses', () => {
    expect(ticketStatusLabel('ZZZ')).toBe('ZZZ')
  })
})
