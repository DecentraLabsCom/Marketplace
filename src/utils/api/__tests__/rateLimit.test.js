/**
 * @jest-environment node
 */

import { createRateLimiter } from '../rateLimit'

const originalFetch = global.fetch
const originalEnv = { ...process.env }

afterEach(() => {
  global.fetch = originalFetch
  process.env = { ...originalEnv }
})

describe('distributed rate limiter', () => {
  test('uses the configured Redis REST store and identity dimensions', async () => {
    process.env.NODE_ENV = 'production'
    process.env.KV_REST_API_URL = 'https://redis.example.com'
    process.env.KV_REST_API_TOKEN = 'redis-token'
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: [0, 4, 59_000] }),
    })

    const checkRate = createRateLimiter({
      operation: 'intent-prepare',
      windowMs: 60_000,
      maxRequests: 5,
    })
    const result = await checkRate(
      new Request('https://market.example/api/test', {
        headers: { 'x-forwarded-for': '203.0.113.10' },
      }),
      { userId: 'alice@example.edu', institutionId: 'uni.example' },
    )

    expect(result).toMatchObject({ limited: false, remaining: 4 })
    expect(global.fetch).toHaveBeenCalledTimes(1)

    const [, options] = global.fetch.mock.calls[0]
    const command = JSON.parse(options.body)
    expect(command[0]).toBe('EVAL')
    expect(command[2]).toBe('3')
    expect(command.join(' ')).not.toContain('alice@example.edu')
    expect(options.headers.Authorization).toBe('Bearer redis-token')
  })

  test('reports a distributed limit hit', async () => {
    process.env.NODE_ENV = 'production'
    process.env.KV_REST_API_URL = 'https://redis.example.com'
    process.env.KV_REST_API_TOKEN = 'redis-token'
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: [1, 0, 12_000] }),
    })

    const result = await createRateLimiter({
      operation: 'simulation-run',
      maxRequests: 1,
    })(new Request('https://market.example/api/test'))

    expect(result).toMatchObject({ limited: true, remaining: 0, retryAfterSec: 12 })
  })

  test('fails closed in production when Redis is not configured', async () => {
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    delete process.env.SESSION_STORE_REST_URL
    delete process.env.SESSION_STORE_REST_TOKEN
    process.env.NODE_ENV = 'production'

    const result = await createRateLimiter({ operation: 'protected-operation' })(
      new Request('https://market.example/api/test'),
    )

    expect(result).toMatchObject({ limited: true, unavailable: true })
  })
})
