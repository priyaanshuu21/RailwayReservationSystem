import { evaluateReading, isSensorKind, SENSOR_BANDS } from '../../src/domain/iot'

describe('evaluateReading', () => {
  it('classifies a mid-band reading as OK', () => {
    expect(evaluateReading(30, { minValue: 15, maxValue: 45 })).toBe('OK')
  })

  it('flags values inside the 10% warning band as WARN', () => {
    expect(evaluateReading(18, { minValue: 15, maxValue: 45 })).toBe('WARN')
    expect(evaluateReading(42, { minValue: 15, maxValue: 45 })).toBe('WARN')
  })

  it('flags out-of-band values as CRITICAL', () => {
    expect(evaluateReading(10, { minValue: 15, maxValue: 45 })).toBe('CRITICAL')
    expect(evaluateReading(50, { minValue: 15, maxValue: 45 })).toBe('CRITICAL')
  })

  it('treats band edges as WARN, never CRITICAL', () => {
    expect(evaluateReading(15, { minValue: 15, maxValue: 45 })).toBe('WARN')
    expect(evaluateReading(45, { minValue: 15, maxValue: 45 })).toBe('WARN')
  })

  it('matches the documented smoke band', () => {
    expect(evaluateReading(0, SENSOR_BANDS.SMOKE)).toBe('WARN')
    expect(evaluateReading(101, SENSOR_BANDS.SMOKE)).toBe('CRITICAL')
    expect(evaluateReading(50, SENSOR_BANDS.SMOKE)).toBe('OK')
  })
})

describe('sensor kinds', () => {
  it('guards known kinds', () => {
    expect(isSensorKind('TEMP')).toBe(true)
    expect(isSensorKind('HUMIDITY')).toBe(false)
  })
})
