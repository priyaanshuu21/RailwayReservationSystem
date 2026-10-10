import { signAccessToken, verifyAccessToken, toClaims } from '../../src/auth/tokens'

const SECRET = 'test-secret-0123456789'

describe('jwt tokens', () => {
  it('round-trips claims', () => {
    const token = signAccessToken({ sub: 1001, email: 'a@b.com', roles: ['passenger'] }, SECRET)
    const claims = verifyAccessToken(token, SECRET)
    expect(claims).toEqual({ sub: 1001, email: 'a@b.com', roles: ['passenger'] })
  })

  it('rejects a token signed with another secret', () => {
    const token = signAccessToken({ sub: 1, email: 'x@y.z', roles: [] }, 'other-secret')
    expect(() => verifyAccessToken(token, SECRET)).toThrow()
  })

  it('rejects a tampered token', () => {
    const token = signAccessToken({ sub: 1, email: 'x@y.z', roles: [] }, SECRET)
    expect(() => verifyAccessToken(`${token}x`, SECRET)).toThrow()
  })
})

describe('toClaims', () => {
  it('normalises roles into strings', () => {
    expect(toClaims({ sub: '42', email: 5, roles: ['tte', 1] })).toEqual({
      sub: 42,
      email: '5',
      roles: ['tte', '1']
    })
  })

  it('throws without a subject', () => {
    expect(() => toClaims({ email: 'x@y.z' })).toThrow()
    expect(() => toClaims(null)).toThrow()
  })
})
