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
} = {}) {
  const correlationId = createCorrelationId()

  if (error) {
    devLog.error('[API error]', {
      correlationId,
      context,
      error: sanitizeErrorForLog(error),
    })
  }

  const response = NextResponse.json(
    { error: message, code, correlationId },
    { status },
  )
  response.headers?.set?.('X-Correlation-ID', correlationId)
  Object.entries(headers).forEach(([key, value]) => {
    if (value !== undefined && value !== null) response.headers?.set?.(key, String(value))
  })
  return response
}

export default publicErrorResponse
