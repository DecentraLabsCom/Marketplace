/** @jest-environment node */

jest.unmock('@/utils/dev/logger')

import devLog, { isDebugEnabled } from '../logger'

describe('development logger', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    jest.restoreAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  test('never enables debug logging from a public production variable', () => {
    process.env.NODE_ENV = 'production'
    process.env.NEXT_PUBLIC_DEBUG_MODE = 'true'

    expect(isDebugEnabled()).toBe(false)
  })

  test('redacts bearer credentials and sensitive object fields before development logs', () => {
    process.env.NODE_ENV = 'development'
    const info = jest.spyOn(console, 'info').mockImplementation(() => {})

    devLog.info('calling with Bearer eyJ.secret.value', {
      token: 'jwt-value',
      nested: { authorization: 'Bearer another-secret', safe: 'ok' },
    })

    expect(info).toHaveBeenCalledWith(
      'calling with Bearer [REDACTED]',
      { token: '[REDACTED]', nested: { authorization: '[REDACTED]', safe: 'ok' } },
    )
  })
})
