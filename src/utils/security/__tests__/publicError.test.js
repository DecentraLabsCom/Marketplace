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

  test('logs safe transport diagnostics from an error cause', () => {
    const previousNodeEnv = process.env.NODE_ENV
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    process.env.NODE_ENV = 'production'

    try {
      publicErrorResponse({
        status: 502,
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'The requested service is temporarily unavailable.',
        error: Object.assign(new Error('fetch failed'), {
          cause: {
            name: 'ConnectTimeoutError',
            code: 'UND_ERR_CONNECT_TIMEOUT',
            syscall: 'connect',
            address: '203.0.113.10',
            port: 443,
            message: 'Bearer secret-token email@example.edu',
            token: 'should-not-be-logged',
          },
        }),
        context: 'test-route',
      })

      const logData = consoleError.mock.calls.at(-1)[1]

      expect(logData.cause).toEqual({
        name: 'ConnectTimeoutError',
        code: 'UND_ERR_CONNECT_TIMEOUT',
        syscall: 'connect',
        address: '203.0.113.10',
        port: 443,
      })
      expect(JSON.stringify(logData)).not.toContain('secret-token')
      expect(JSON.stringify(logData)).not.toContain('email@example.edu')
      expect(JSON.stringify(logData)).not.toContain('should-not-be-logged')
    } finally {
      process.env.NODE_ENV = previousNodeEnv
      consoleError.mockRestore()
    }
  })

  test('omits cause diagnostics when the cause has no safe fields', () => {
    const previousNodeEnv = process.env.NODE_ENV
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
    process.env.NODE_ENV = 'production'

    try {
      publicErrorResponse({
        status: 502,
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'The requested service is temporarily unavailable.',
        error: Object.assign(new Error('fetch failed'), { cause: { stack: 'sensitive details' } }),
        context: 'test-route',
      })

      const logData = consoleError.mock.calls.at(-1)[1]

      expect(logData).not.toHaveProperty('cause')
    } finally {
      process.env.NODE_ENV = previousNodeEnv
      consoleError.mockRestore()
    }
  })
})
