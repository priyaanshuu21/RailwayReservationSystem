// Pure IoT threshold logic (Phase 7). Mirrors pkg_iot.evaluate so the API can
// pre-classify without a round-trip and unit-test the band rules.

export type SensorKind = 'TEMP' | 'SMOKE' | 'DOOR' | 'AQI'
export type ReadingStatus = 'OK' | 'WARN' | 'CRITICAL'

export interface SensorBand {
  minValue: number
  maxValue: number
}

export const SENSOR_KINDS: readonly SensorKind[] = ['TEMP', 'SMOKE', 'DOOR', 'AQI']

export const SENSOR_BANDS: Record<SensorKind, SensorBand> = {
  TEMP: { minValue: 15, maxValue: 45 },
  SMOKE: { minValue: 0, maxValue: 100 },
  DOOR: { minValue: 0, maxValue: 1 },
  AQI: { minValue: 0, maxValue: 300 }
}

export function isSensorKind(value: string): value is SensorKind {
  return (SENSOR_KINDS as readonly string[]).includes(value)
}

export function evaluateReading(value: number, band: SensorBand): ReadingStatus {
  if (value < band.minValue || value > band.maxValue) return 'CRITICAL'
  const warn = (band.maxValue - band.minValue) * 0.1
  if (value <= band.minValue + warn || value >= band.maxValue - warn) return 'WARN'
  return 'OK'
}
