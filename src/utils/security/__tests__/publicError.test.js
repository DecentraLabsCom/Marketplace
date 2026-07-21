/** @jest-environment node */

import { publicErrorResponse, sanitizeErrorForLog } from '../publicError'

describe('publicError', () => {
  test('returns only a normalized public error and correlation ID', async () => {
    const response = publicErrorResponse({
      status: 502,
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'The requested service is temporarily unavailable.',
      error: new Error('Bearer secret-token gateway response with private details'),
      context: 'test-route',
    })

    const body = await response.json()

    expect(response.status).toBe(502)
    expect(response.headers.get('X-Correlation-ID')).toMatch(/^[0-9a-f-]{36}$/i)
    expect(body).toEqual({
      error: 'The requested service is temporarily unavailable.',
      code: 'UPSTREAM_UNAVAILABLE',
      correlationId: body.correlationId,
    })
    expect(body).not.toHaveProperty('details')
    expect(body).not.toHaveProperty('stack')
    expect(body.correlationId).toBe(response.headers.get('X-Correlation-ID'))
  })

  test('sanitizes sensitive values before they reach server logs', () => {
    const safe = sanitizeErrorForLog(new Error('Bearer secret token email@example.edu accessKey=abc123'))

    expect(safe).not.toContain('secret')
    expect(safe).not.toContain('email@example.edu')
    expect(safe).not.toContain('abc123')
    expect(safe.length).toBeLessThanOrEqual(500)
  })

  test('writes sanitized API errors to production logs', () => {
    const previousNodeEnv = process.env.NODE_ENV
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    process.env.NODE_ENV = 'production'

    try {
      publicErrorResponse({
        status: 502,
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'The requested service is temporarily unavailable.',
        error: new Error('Bearer secret-token gateway response for email@example.edu'),
        context: 'test-route',
      })

      expect(consoleError).toHaveBeenCalledWith(
        '[API error]',
        expect.objectContaining({
          context: 'test-route',
          error: expect.not.stringContaining('secret-token'),
        }),
      )
    } finally {
      process.env.NODE_ENV = previousNodeEnv
      consoleError.mockRestore()
    }
  })
})
