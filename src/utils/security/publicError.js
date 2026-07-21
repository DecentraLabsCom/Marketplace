import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'

const MAX_LOG_MESSAGE_LENGTH = 500

const redactSensitiveText = (value) => String(value || '')
  .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
  .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]')
  .replace(/\b(access[_-]?key|api[_-]?key|token|password|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')

export const sanitizeErrorForLog = (error) => {
  const message = error instanceof Error ? error.message : error
  return redactSensitiveText(message || 'Unknown error').slice(0, MAX_LOG_MESSAGE_LENGTH)
}

export const createCorrelationId = () => randomUUID()

/**
 * Build a browser-safe API error. Detailed causes are logged in a bounded,
 * redacted form and never serialized into the response body.
 */
export function publicErrorResponse({
  status = 500,
  code = 'INTERNAL_ERROR',
  message = 'The request could not be completed.',
  error = null,
  context = 'api',
  headers = {},
  fields = {},
} = {}) {
  const correlationId = createCorrelationId()

  if (error) {
    const logData = {
      correlationId,
      context,
      error: sanitizeErrorForLog(error),
    }

    // Development logging is intentionally quiet in production, but API
    // failures need a bounded, redacted record in hosted runtime logs. This
    // is especially important for proxy routes where the browser only sees a
    // generic public error.
    if (process.env.NODE_ENV === 'production') {
      console.error('[API error]', logData)
    } else {
      devLog.error('[API error]', logData)
    }
  }

  const response = NextResponse.json(
    {
      ...(fields && typeof fields === 'object' && !Array.isArray(fields) ? fields : {}),
      error: message,
      code,
      correlationId,
    },
    { status },
  )
  response.headers?.set?.('X-Correlation-ID', correlationId)
  Object.entries(headers).forEach(([key, value]) => {
    if (value !== undefined && value !== null) response.headers?.set?.(key, String(value))
  })
  return response
}

export default publicErrorResponse
