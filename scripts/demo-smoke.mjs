// Real API + Oracle regression checks. Uses fresh bookings and cancels them in finally.
// A prepared demo is required. No data reset is performed.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
const base = process.env.DEMO_API_URL ?? 'http://127.0.0.1:4000'
let checks = 0
async function call(path, token, body, status = 200) {
  const r = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await r.json()
  assert.equal(r.status, status, `${path}: ${JSON.stringify(data)}`)
  checks++
  return data
}
async function login(email) {
  return (await call('/api/auth/login', null, { email, password: 'Demo@123' }))
    .token
}
const passenger = await login('passenger@railnexus.local'),
  tte = await login('tte@railnexus.local'),
  station = await login('station@railnexus.local'),
  zone = await login('zoneadmin@railnexus.local'),
  admin = await login('admin@railnexus.local'),
  other = await login('meera.demo@railnexus.dev')
assert.equal((await call('/health/ready')).status, 'ready')
const routes = [
  [101, 301],
  [201, 303],
  [203, 103],
  [102, 302],
  [201, 202],
  [301, 303],
]
for (let d = 1; d <= 30; d++)
  for (const [from, to] of routes) {
    const r = await call(
      `/api/search?from=${from}&to=${to}&date=2026-10-${String(d).padStart(2, '0')}`,
    )
    assert.ok(
      r.trains.length > 0,
      `Missing daily route ${from}-${to}, day ${d}`,
    )
    assert.ok(r.trains.every((t) => t.TRAIN_TYPE !== 'F'))
  }
console.log('PASS: all six routes on all 30 October dates (180 searches)')
await call('/api/iot/sensors?zoneCode=NR', passenger, undefined, 403)
await call('/api/reporting/zones', passenger, undefined, 403)
const z = await call('/api/reporting/zones', zone)
assert.deepEqual(
  z.zones.map((x) => x.ZONE_ID),
  [1],
)
assert.ok(z.zones[0].BOOKING_COUNT > 0)
const a = await call('/api/reporting/zones', admin)
assert.equal(a.zones.length, 3)
assert.ok(a.zones.every((x) => x.BOOKING_COUNT > 0))
assert.ok((await call('/api/reporting/revenue', admin)).days.length >= 30)
assert.ok(
  (await call('/api/reporting/occupancy', zone)).rows.every(
    (x) => x.ZONE_ID === 1,
  ),
)
await call('/api/reporting/refresh', zone, {}, 403)
await call('/api/reporting/refresh', admin, {})
console.log(
  'PASS: populated reports, zone scope, and materialized-view refresh',
)
const scope = await call('/api/operations/scope', station)
assert.equal(scope.stationId, 103)
await call(
  '/api/announcements',
  station,
  { stationId: 201, message: 'This must be rejected: wrong station', hours: 1 },
  403,
)
const notice = `Demo smoke ${randomUUID()}: Train 12002 platform announcement.`
await call(
  '/api/announcements',
  station,
  { stationId: 103, message: notice, hours: 1 },
  201,
)
assert.ok(
  (await call('/api/announcements')).announcements.some(
    (x) => x.MESSAGE === notice,
  ),
)
console.log('PASS: station-master announcement visible to passengers')
const sensors = (await call('/api/iot/sensors?zoneCode=NR', tte)).sensors
const sensor = sensors.find((x) => x.SENSOR_KIND === 'TEMP')
assert.ok(sensor)
const reading = await call(
  '/api/iot/readings',
  tte,
  { zoneCode: 'NR', sensorId: sensor.SENSOR_ID, value: 60 },
  201,
)
assert.equal(reading.status, 'CRITICAL')
assert.ok(reading.alertId)
await call(`/api/iot/alerts/${reading.alertId}/ack`, tte, {
  zoneCode: 'NR',
  actor: 'demo-smoke',
})
await call('/api/iot/sensors?zoneCode=WR', tte, undefined, 403)
console.log(
  'PASS: TTE sensor dropdown data, critical alert, acknowledgement, zone access',
)
const train = (await call('/api/search?from=101&to=301&date=2026-10-29'))
  .trains[0]
const classes = (await call(`/api/schedules/${train.SCHEDULE_ID}/classes`))
  .classes
assert.ok(classes.includes('1A'))
assert.ok(!classes.includes('CC'))
const initial = await call(
  `/api/schedules/${train.SCHEDULE_ID}/availability?coachClass=1A`,
)
assert.equal(
  initial.freeSeats,
  2,
  '29 October 1A test compartment must have two free seats. Existing reservations are preserved; do not reset them blindly.',
)
assert.equal(initial.racRemaining, 0)
const bookings = []
try {
  for (let i = 0; i < 3; i++) {
    const payload = {
      scheduleId: train.SCHEDULE_ID,
      fromStop: train.FROM_STOP,
      toStop: train.TO_STOP,
      coachClass: '1A',
      berthPreference: 'LB',
      requestId: randomUUID(),
    }
    const b = await call('/api/bookings', passenger, payload, 201)
    bookings.push(b)
    assert.ok(b.bookingId > 0 && b.ticketId > 0)
    assert.match(b.pnr, /^NR\d{8}$/)
    assert.equal(b.status, i < 2 ? 'CFM' : 'WL')
    const replay = await call('/api/bookings', passenger, payload, 201)
    assert.equal(replay.pnr, b.pnr)
  }
  const [first, second, waiting] = bookings
  const details = await call('/api/bookings/' + first.pnr, passenger)
  assert.equal(details.berth, 'LB')
  assert.ok(details.coachNo && details.seatNo)
  assert.ok(Number.isFinite(details.fareTotal))
  assert.equal(
    (await call('/api/bookings/' + waiting.pnr, passenger)).queuePosition,
    1,
  )
  await call('/api/bookings/' + first.pnr, other, undefined, 403)
  await call('/api/bookings/' + first.pnr + '/cancel', other, {}, 403)
  const pay = {
    zoneCode: first.zone,
    bookingId: first.bookingId,
    method: 'U',
    amount: details.fareTotal,
    providerRef: ('SMOKE-' + randomUUID()).slice(0, 40),
    requestId: randomUUID(),
    upiHandle: 'demo@upi',
  }
  await call('/api/payments', other, pay, 400)
  await call('/api/payments', passenger, { ...pay, amount: 1 }, 409)
  await call('/api/payments', passenger, pay, 201)
  await call('/api/payments', passenger, pay, 201)
  const refund = await call(
    '/api/bookings/' + first.pnr + '/cancel',
    passenger,
    {},
  )
  assert.equal(refund.refundAmount, details.fareTotal)
  const promoted = await call('/api/bookings/' + waiting.pnr, passenger)
  assert.equal(promoted.ticketStatus, 'CFM')
  assert.equal(promoted.seatNo, details.seatNo)
  assert.equal(
    (
      await call(
        `/api/schedules/${train.SCHEDULE_ID}/availability?coachClass=1A`,
      )
    ).freeSeats,
    0,
  )
  const manifest = await call(
    `/api/tte/schedules/${train.SCHEDULE_ID}/passengers`,
    tte,
  )
  assert.ok(manifest.tickets.some((x) => x.PNR === waiting.pnr))
  await call('/api/tte/board', tte, { pnr: second.pnr, zoneCode: 'NR' })
  const boarded = (
    await call(`/api/tte/schedules/${train.SCHEDULE_ID}/passengers`, tte)
  ).tickets.find((x) => x.PNR === second.pnr)
  assert.equal(boarded.BOARDING_STATUS, 'B')
  console.log(
    'PASS: berth preference, confirmed booking, idempotency, payment, ownership, WL promotion, refund, seat consistency and TTE boarding',
  )
} finally {
  for (const b of bookings) {
    const current = await call('/api/bookings/' + b.pnr, passenger)
    if (current.ticketStatus !== 'CNL')
      await call('/api/bookings/' + b.pnr + '/cancel', passenger, {})
  }
}
// Exercise the full CFM -> RAC -> WL chain on a separate date; preserve all prior data.
const racTrain = (await call('/api/search?from=101&to=301&date=2026-10-30'))
  .trains[0]
const before = await call(
  `/api/schedules/${racTrain.SCHEDULE_ID}/availability?coachClass=1A`,
)
assert.ok(before.freeSeats <= 24 && before.racRemaining > 0)
const actorTokens = [passenger, other]
// Resolve the remaining seeded passenger emails through the documented seed fixture.
const { readFileSync } = await import('node:fs')
const { fileURLToPath } = await import('node:url')
const seed = readFileSync(
  fileURLToPath(new URL('../db/shared_ddl/02_seed_data.sql', import.meta.url)),
  'utf8',
)
for (let id = 1003; id <= 1010; id++) {
  const line = seed.split('\n').find((l) => l.startsWith(`VALUES (${id}, 'P'`))
  const email = line.match(/'([^']+@[^']+)'/)[1]
  actorTokens.push(await login(email))
}
const chain = []
try {
  for (let n = 0; n < before.freeSeats + before.racRemaining + 1; n++) {
    const token = actorTokens[n % actorTokens.length]
    const b = await call(
      '/api/bookings',
      token,
      {
        scheduleId: racTrain.SCHEDULE_ID,
        fromStop: racTrain.FROM_STOP,
        toStop: racTrain.TO_STOP,
        coachClass: '1A',
        requestId: randomUUID(),
      },
      201,
    )
    chain.push({ ...b, token })
    assert.equal(
      b.status,
      n < before.freeSeats
        ? 'CFM'
        : n < before.freeSeats + before.racRemaining
          ? 'RAC'
          : 'WL',
    )
  }
  await call('/api/bookings/' + chain[0].pnr + '/cancel', chain[0].token, {})
  const firstRac = chain[before.freeSeats],
    wl = chain.at(-1)
  assert.equal(
    (await call('/api/bookings/' + firstRac.pnr, firstRac.token)).ticketStatus,
    'CFM',
  )
  assert.equal(
    (await call('/api/bookings/' + wl.pnr, wl.token)).ticketStatus,
    'RAC',
  )
  assert.equal(
    (
      await call(
        `/api/schedules/${racTrain.SCHEDULE_ID}/availability?coachClass=1A`,
      )
    ).freeSeats,
    0,
  )
  console.log(
    'PASS: RAC priority, FIFO promotion, WL -> RAC, no double-free seats',
  )
} finally {
  for (const b of chain) {
    const v = await call('/api/bookings/' + b.pnr, b.token)
    if (v.ticketStatus !== 'CNL')
      await call('/api/bookings/' + b.pnr + '/cancel', b.token, {})
  }
}
assert.equal(
  (
    await call(
      `/api/schedules/${racTrain.SCHEDULE_ID}/availability?coachClass=1A`,
    )
  ).freeSeats,
  before.freeSeats,
)
// A public catalogue schedule ID must map to the correct zone-local inventory ID.
for (const [from, to, coachClass, method] of [
  [201, 303, 'SL', 'C'],
  [301, 303, '2S', 'W'],
]) {
  const journey = (
    await call(`/api/search?from=${from}&to=${to}&date=2026-10-27`)
  ).trains[0]
  const b = await call(
    '/api/bookings',
    passenger,
    {
      scheduleId: journey.SCHEDULE_ID,
      fromStop: journey.FROM_STOP,
      toStop: journey.TO_STOP,
      coachClass,
      requestId: randomUUID(),
    },
    201,
  )
  try {
    const v = await call('/api/bookings/' + b.pnr, passenger)
    assert.equal(v.trainId, journey.TRAIN_ID)
    assert.equal(v.journeyDate, '2026-10-27')
    await call(
      '/api/payments',
      passenger,
      {
        zoneCode: b.zone,
        bookingId: b.bookingId,
        method,
        amount: v.fareTotal,
        providerRef: randomUUID(),
        requestId: randomUUID(),
        maskedPan: '4111 XXXX XXXX 1111',
        cardScheme: 'VISA',
        walletProvider: 'DemoWallet',
        walletTxn: randomUUID(),
      },
      201,
    )
    const refund = await call(
      '/api/bookings/' + b.pnr + '/cancel',
      passenger,
      {},
    )
    assert.equal(refund.refundAmount, v.fareTotal)
  } finally {
    const current = await call('/api/bookings/' + b.pnr, passenger)
    if (current.ticketStatus !== 'CNL')
      await call('/api/bookings/' + b.pnr + '/cancel', passenger, {})
  }
}
console.log(
  'PASS: western and southern schedule mapping, Card and Wallet capture, refunds',
)
const audit = await call('/api/admin/audit', admin)
assert.ok(audit.events.some((x) => x.EVENT_TYPE === 'TICKET_PROMOTED'))
assert.ok(audit.outbox.every((x) => x.EVENT_COUNT > 0))
assert.equal(
  (await call(`/api/schedules/${train.SCHEDULE_ID}/availability?coachClass=1A`))
    .freeSeats,
  2,
)
console.log(
  `PASS: ${checks} real API assertions; audit/outbox trigger events present; test seats released`,
)
