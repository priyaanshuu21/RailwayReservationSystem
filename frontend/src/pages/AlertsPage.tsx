import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, type AlertRow } from '../lib/api'
import { Badge, Button, Card, Field, Input, Note, Select } from '../components/ui'

export function AlertsPage() {
  const [zoneCode, setZoneCode] = useState('NR')
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [sensorId, setSensorId] = useState('')
  const [value, setValue] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    api
      .alerts(zoneCode)
      .then((res) => setAlerts(res.alerts))
      .catch((err) => setError(err instanceof Error ? err.message : 'could not load alerts'))
  }, [zoneCode])

  useEffect(load, [load])

  async function onSimulate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    try {
      const res = await api.ingestReading(zoneCode, Number(sensorId), Number(value))
      setMessage(`Reading #${res.readingId} stored as ${res.status}${res.alertId ? ` (alert #${res.alertId})` : ''}`)
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
      <Card title="IoT telemetry">
        <div className="mb-4 max-w-xs">
          <Field label="Zone">
            <Select value={zoneCode} onChange={(e) => setZoneCode(e.target.value)}>
              <option value="NR">NR</option>
              <option value="WR">WR</option>
              <option value="SR">SR</option>
            </Select>
          </Field>
        </div>
        <form onSubmit={onSimulate} className="flex flex-wrap items-end gap-4">
          <Field label="Sensor id">
            <Input value={sensorId} onChange={(e) => setSensorId(e.target.value)} required />
          </Field>
          <Field label="Value">
            <Input value={value} onChange={(e) => setValue(e.target.value)} required />
          </Field>
          <Button type="submit">Simulate reading</Button>
        </form>
        {message ? <div className="mt-3"><Note>{message}</Note></div> : null}
        {error ? <div className="mt-3"><Note kind="error">{error}</Note></div> : null}
      </Card>

      <Card title={`Open alerts (${alerts.length})`}>
        {alerts.length === 0 ? (
          <Note>No open alerts in zone {zoneCode}.</Note>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {alerts.map((a) => (
              <li key={a.ALERT_ID} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={a.SEVERITY === 'HIGH' ? 'danger' : 'warn'}>{a.SEVERITY}</Badge>
                    <span className="font-medium text-ink">{a.SENSOR_KIND} sensor #{a.SENSOR_ID}</span>
                    <span className="text-sm text-muted">coach {a.COACH_ID}</span>
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
