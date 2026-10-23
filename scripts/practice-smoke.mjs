import assert from 'node:assert/strict'
const base = process.env.DEMO_API_URL ?? 'http://127.0.0.1:4000'
async function call(path, token, body, expected = 200) {
  const r = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const b = await r.json()
  assert.equal(r.status, expected, JSON.stringify(b))
  return b
}
async function login(email) {
  return (await call('/api/auth/login', null, { email, password: 'Demo@123' }))
    .token
}
const aarav = await login('passenger@railnexus.local'),
  meera = await login('meera.demo@railnexus.dev')
await call('/api/practice/wl', undefined, undefined, 401)
await call('/api/practice/normal/reset', aarav, {}, 404)
const historyBefore = (await call('/api/my/bookings', aarav)).bookings.filter(
  (b) => !b.TRAIN_NAME.startsWith('Practice:'),
).length
for (let round = 0; round < 2; round++)
  for (const lab of ['wl', 'rac']) {
    const s = (await call(`/api/practice/${lab}/reset`, aarav, {})).state
    assert.equal(s.capacity, 2)
    assert.equal(s.freeSeats, 2)
    assert.equal(s.tickets.length, 0)
    const tickets = []
    const limit = lab === 'wl' ? 3 : 4
    for (let i = 0; i < limit; i++) {
      const token = i === limit - 1 ? meera : aarav
      const b = await call(`/api/practice/${lab}/book`, token, {}, 201)
      assert.equal(
        b.result.status,
        i < 2 ? 'CFM' : lab === 'rac' && i === 2 ? 'RAC' : 'WL',
      )
      if (i < 2)
        assert.ok(
          b.state.tickets.find((t) => t.PNR === b.result.pnr).PAID_AMOUNT > 0,
        )
      tickets.push(b.result)
    }
    let board = await call(`/api/practice/${lab}`, meera)
    assert.equal(board.freeSeats, 0)
    assert.equal(board.waitlisted, 1)
    assert.equal(board.racWaiting, lab === 'rac' ? 1 : 0)
    await call(
      `/api/practice/${lab}/cancel`,
      meera,
      { pnr: tickets[0].pnr },
      403,
    )
    const cancelled = await call(`/api/practice/${lab}/cancel`, aarav, {
      pnr: tickets[0].pnr,
    })
    assert.ok(cancelled.refundAmount > 0)
    assert.equal(cancelled.state.freeSeats, 0)
    assert.equal(
      cancelled.state.tickets.find((t) => t.PNR === tickets[2].pnr).STATUS,
      'CFM',
    )
    if (lab === 'rac')
      assert.equal(
        cancelled.state.tickets.find((t) => t.PNR === tickets[3].pnr).STATUS,
        'RAC',
      )
    else
      assert.equal(
        cancelled.state.tickets.find((t) => t.PNR === tickets[2].pnr).PASSENGER,
        'Meera Nair',
      )
    const reset = (await call(`/api/practice/${lab}/reset`, aarav, {})).state
    assert.equal(reset.freeSeats, 2)
    assert.equal(reset.tickets.length, 0)
    console.log(
      `PASS round ${round + 1}: ${lab}, 2 seats, queue, ownership, payment, refund, promotion, reset`,
    )
  }
assert.equal(
  (await call('/api/my/bookings', aarav)).bookings.filter(
    (b) => !b.TRAIN_NAME.startsWith('Practice:'),
  ).length,
  historyBefore,
)
console.log(
  'PASS normal booking history preserved; both practice scenarios repeatable with two actual passengers',
)
