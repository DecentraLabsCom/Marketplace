/**
 * @jest-environment node
 */

import { redisCommand } from '../restClient'

describe('redis REST client', () => {
  const environment = {
    KV_REST_API_URL: process.env.KV_REST_API_URL,
    KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
    REDIS_REST_TIMEOUT_MS: process.env.REDIS_REST_TIMEOUT_MS,
  }

  beforeEach(() => {
    jest.restoreAllMocks()
    process.env.KV_REST_API_URL = 'https://redis.example.test'
    process.env.KV_REST_API_TOKEN = 'test-token'
    delete process.env.REDIS_REST_TIMEOUT_MS
  })

  afterAll(() => {
    Object.entries(environment).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    })
  })

  test('bounds Redis REST calls with an abort signal', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ result: 'PONG' }),
    })

    await expect(redisCommand(['PING'])).resolves.toBe('PONG')

    expect(global.fetch).toHaveBeenCalledWith(
      'https://redis.example.test',
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      }),
    )
  })

  test('surfaces an aborted Redis call as a timeout', async () => {
    jest.useFakeTimers()
    process.env.REDIS_REST_TIMEOUT_MS = '500'
    global.fetch = jest.fn((_, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      })
    }))

    let timeoutError
    const command = redisCommand(['GET', 'marketplace:test']).catch((error) => {
      timeoutError = error
    })
    await jest.advanceTimersByTimeAsync(500)

    await command
    expect(timeoutError).toEqual(expect.objectContaining({
      message: 'Redis REST request timed out',
    }))
    jest.useRealTimers()
  })
})
