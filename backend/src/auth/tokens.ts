import jwt, { type SignOptions } from 'jsonwebtoken'

// Pure JWT helpers (Phase 8). The secret is injected so the token logic is
// unit-testable without touching config or a database.

export interface TokenClaims {
  sub: number
  email: string
  roles: string[]
}

export function toClaims(decoded: unknown): TokenClaims {
  if (typeof decoded !== 'object' || decoded === null) {
    throw new Error('invalid token payload')
  }
  const payload = decoded as Record<string, unknown>
  const sub = Number(payload.sub)
  if (!Number.isFinite(sub)) throw new Error('token missing subject')
  const roles = Array.isArray(payload.roles) ? (payload.roles as unknown[]).map(String) : []
  return { sub, email: String(payload.email ?? ''), roles }
}

export function signAccessToken(claims: TokenClaims, secret: string, expiresIn = '15m'): string {
  const options: SignOptions = {
    subject: String(claims.sub),
    expiresIn: expiresIn as SignOptions['expiresIn']
  }
  return jwt.sign({ email: claims.email, roles: claims.roles }, secret, options)
}

export function verifyAccessToken(token: string, secret: string): TokenClaims {
  return toClaims(jwt.verify(token, secret))
}
