import { pino, stdTimeFunctions, type DestinationStream, type Logger } from "pino"

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug")

export function createLogger(destination?: DestinationStream): Logger {
  const options = {
    level,
    timestamp: stdTimeFunctions.isoTime,
    redact: {
      paths: [
        "req.headers.cookie",
        "req.headers.authorization",
        "req.headers.x-internal-token",
        'res.headers["set-cookie"]',
      ],
      censor: "[REDACTED]",
    },
  }
  return destination === undefined ? pino(options) : pino(options, destination)
}

export const logger: Logger = createLogger()
