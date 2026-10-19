import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, demoApi, type Sensor, type AlertRow } from '../lib/api'
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Note,
  Select,
} from '../components/ui'

export function AlertsPage() {
  const [sensors, setSensors] = useState<Sensor[]>([])
  const [allowedZones, setAllowedZones] = useState(['NR', 'WR', 'SR'])
  const [zoneCode, setZoneCode] = useState('NR')
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [sensorId, setSensorId] = useState('')
  const [value, setValue] = useState('60')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    demoApi
      .scope()
      .then((s) => {
        if (s.zoneId) {
          const code = ['NR', 'WR', 'SR'][s.zoneId - 1]
          setAllowedZones([code])
          setZoneCode(code)
        }
      })
      .catch((e) => setError(e.message))
  }, [])
  useEffect(() => {
    demoApi
      .sensors(zoneCode)
      .then((r) => {
        setSensors(r.sensors)
        setSensorId(String(r.sensors[0]?.SENSOR_ID ?? ''))
      })
      .catch((e) => setError(e.message))
  }, [zoneCode])

  const load = useCallback(() => {
    setError(null)
    api
      .alerts(zoneCode)
      .then((res) => setAlerts(res.alerts))
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'could not load alerts'),
      )
  }, [zoneCode])

  useEffect(load, [load])

  async function onSimulate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    try {
      const res = await api.ingestReading(
        zoneCode,
        Number(sensorId),
        Number(value),
      )
      setMessage(
        `Reading #${res.readingId} stored as ${res.status}${res.alertId ? ` (alert #${res.alertId})` : ''}`,
      )
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ingest failed')
    }
  }

  async function onAck(alertId: number) {
    try {
      await api.ackAlert(zoneCode, alertId)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ack failed')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card title="Staff safety alerts">
        <div className="mb-3">
          <Note>
            For a TEMP sensor, enter 30 for a normal reading or 60 to raise a
            critical alert; then acknowledge it below. Sensor thresholds are
            shown in the dropdown.
          </Note>
        </div>
        <div className="mb-4 max-w-xs">
          <Field label="Zone">
            <Select
              value={zoneCode}
              onChange={(e) => setZoneCode(e.target.value)}
            >
              {allowedZones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <form onSubmit={onSimulate} className="flex flex-wrap items-end gap-4">
          <Field label="Sensor id">
            <Select
              value={sensorId}
              onChange={(e) => setSensorId(e.target.value)}
              required
            >
              <option value="">Choose a sensor</option>
              {sensors.map((s) => (
                <option key={s.SENSOR_ID} value={s.SENSOR_ID}>
                  #{s.SENSOR_ID} · {s.SENSOR_KIND} · {s.COACH_NO} ·{' '}
                  {s.TRAIN_NAME} ({s.MIN_VALUE}–{s.MAX_VALUE} {s.UNIT})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Value">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </Field>
          <Button type="submit" disabled={!sensorId}>
            Simulate reading
          </Button>
        </form>
        {message ? (
          <div className="mt-3">
            <Note>{message}</Note>
          </div>
        ) : null}
        {error ? (
          <div className="mt-3">
            <Note kind="error">{error}</Note>
          </div>
        ) : null}
      </Card>

      <Card title={`Open alerts (${alerts.length})`}>
        {alerts.length === 0 ? (
          <Note>No open alerts in zone {zoneCode}.</Note>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {alerts.map((a) => (
              <li
                key={a.ALERT_ID}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={a.SEVERITY === 'HIGH' ? 'danger' : 'warn'}>
                      {a.SEVERITY}
                    </Badge>
                    <span className="font-medium text-ink">
                      {a.SENSOR_KIND} sensor #{a.SENSOR_ID}
                    </span>
                    <span className="text-sm text-muted">
                      coach {a.COACH_ID}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{a.MESSAGE}</p>
                </div>
                <Button variant="ghost" onClick={() => onAck(a.ALERT_ID)}>
                  Acknowledge
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
