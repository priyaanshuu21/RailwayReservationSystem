import { Router, type NextFunction, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { query } from '../../db/oracle'
import { authenticate } from '../../auth/service'
import { signAccessToken } from '../../auth/tokens'
import { env } from '../../config/env'
import { requireAuth, type AuthedRequest } from '../middleware/auth'

// Auth routes (Phase 8): login issues a JWT with role claims; /me echoes them.

export const authRouter = Router()

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next)
  }

const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

authRouter.post(
  '/login',
  loginLimiter,
  wrap(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ code: 'BAD_REQUEST', issues: parsed.error.issues })
      return
    }
    const user = await authenticate(parsed.data.email, parsed.data.password)
    if (!user) {
      res
        .status(401)
        .json({
          code: 'INVALID_CREDENTIALS',
          message: 'email or password is incorrect',
        })
      return
    }
    const token = signAccessToken(
      { sub: user.personId, email: user.email, roles: user.roles },
      env.jwt.accessSecret,
      env.jwt.accessTtl,
    )
    res.json({
      token,
      tokenType: 'Bearer',
      expiresIn: env.jwt.accessTtl,
      user,
    })
  }),
)

authRouter.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const claims = (req as AuthedRequest).user!
    const rows = await query<{ FULL_NAME: string; PERSON_TYPE: string }>(
      'SELECT full_name,person_type FROM person WHERE person_id=:1',
      [Number(claims.sub)],
    )
    res.json({
      user: {
        personId: Number(claims.sub),
        email: claims.email,
        roles: claims.roles,
        fullName: rows[0]?.FULL_NAME,
        personType: rows[0]?.PERSON_TYPE,
      },
    })
  }),
)
