import type { NextFunction, Request, Response } from 'express'
import { env } from '../../config/env'
import { verifyAccessToken, type TokenClaims } from '../../auth/tokens'

// JWT auth middleware (Phase 8). Routes that need an identity attach the claims
// to req.user via requireAuth; requireRole then gates by role membership.

export interface AuthedRequest extends Request {
  user?: TokenClaims
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ code: 'UNAUTHORIZED', message: 'Bearer token required' })
    return
  }
  try {
    const authed = req as AuthedRequest
    authed.user = verifyAccessToken(header.slice(7), env.jwt.accessSecret)
    next()
  } catch {
    res.status(401).json({ code: 'INVALID_TOKEN', message: 'token is invalid or expired' })
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthedRequest).user
    if (!user) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'authentication required' })
      return
    }
    if (!user.roles.some((role) => roles.includes(role))) {
      res.status(403).json({ code: 'FORBIDDEN', message: `requires role: ${roles.join(' or ')}` })
      return
    }
    next()
  }
}
