import winston from 'winston'

const redact = winston.format((info) => {
  if (info.message) {
    // Never leak connection secrets, passwords, tokens or card-looking values.
    info.message = String(info.message).replace(
      /(password|authorization|secret|token|cvv|card)[=: ]+["']?[^\s"',}]{4,}/gi,
      '$1=[REDACTED]'
    )
  }
  return info
})

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: winston.format.combine(
    redact(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
})

export function withRequestId(rid: string) {
  return winston.child({ requestId: rid })
}