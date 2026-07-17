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
      JSON.stringify('calling with Bearer [REDACTED]'),
      JSON.stringify({ token: '[REDACTED]', nested: { authorization: '[REDACTED]', safe: 'ok' } }),
    )
  })

  test('escapes control characters before writing user-provided values to logs', () => {
    process.env.NODE_ENV = 'development'
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})

    devLog.warn('request failed\r\n forged-entry', {
      'user\nfield': 'value\r\nforged-entry\u2028',
    })

    expect(warn).toHaveBeenCalledWith(
      JSON.stringify('request failed\\u000d\\u000a forged-entry'),
      JSON.stringify({ 'user\\u000afield': 'value\\u000d\\u000aforged-entry\\u2028' }),
    )
  })
})
