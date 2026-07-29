/** @jest-environment node */

jest.mock('@/utils/redis/restClient', () => ({
  hasRedisConfig: jest.fn(),
  redisCommand: jest.fn(),
}))

import {
  ackFmuRevocation,
  clearSamlSessionBinding,
  clearSamlSessionStateForTests,
  enqueueFmuRevocation,
  getDueFmuRevocations,
  getFmuCapabilitiesForSession,
  getSamlSessionIds,
  removeFmuCapabilityForSession,
  registerFmuCapabilityForSession,
  registerSamlSessionBinding,
  rescheduleFmuRevocation,
} from '../samlSessionStateStore'
import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient'

describe('samlSessionStateStore', () => {
  const sessionId = 'a'.repeat(43)
  const nameId = 'name-id-1'
  const sessionIndex = 'session-index-1'
  const context = {
    labId: '42',
    reservationKey: 'reservation-1',
    gatewayOrigin: 'https://lab.example',
    resourceSessionId: 'resource-session-1',
    expiresAt: Math.floor(Date.now() / 1000) + 300,
    userBinding: 'b'.repeat(43),
  }

  beforeEach(() => {
    process.env.NODE_ENV = 'test'
    hasRedisConfig.mockReturnValue(false)
    redisCommand.mockReset()
    clearSamlSessionStateForTests()
  })

  test('persists the SAML binding and encrypted capability snapshot across reads', async () => {
    await registerSamlSessionBinding({ sessionId, nameId, sessionIndex, ttlSeconds: 300 })
    await registerFmuCapabilityForSession({ sessionId, context, ttlSeconds: 300 })

    await expect(getSamlSessionIds(nameId, sessionIndex)).resolves.toEqual([sessionId])
    await expect(getFmuCapabilitiesForSession(sessionId)).resolves.toEqual([context])
  })

  test('clears the durable SAML binding', async () => {
    await registerSamlSessionBinding({ sessionId, nameId, sessionIndex, ttlSeconds: 300 })
    await clearSamlSessionBinding(nameId, sessionIndex)

    await expect(getSamlSessionIds(nameId, sessionIndex)).resolves.toEqual([])
  })

  test('adds capabilities and preserves the longest Redis TTL atomically', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    const originalEncryptionKey = process.env.SESSION_STORE_ENCRYPTION_KEY
    const firstContext = { ...context, resourceSessionId: 'resource-session-1' }
    const secondContext = { ...context, resourceSessionId: 'resource-session-2' }
    const storedValues = []

    try {
      process.env.NODE_ENV = 'production'
      process.env.SESSION_STORE_ENCRYPTION_KEY = 'a'.repeat(64)
      hasRedisConfig.mockReturnValue(true)
      redisCommand.mockImplementation(async ([command, , , , member]) => {
        if (command === 'EVAL') {
          storedValues.push(member)
          return 1
        }
        if (command === 'SMEMBERS') return storedValues
        return 'OK'
      })

      await registerFmuCapabilityForSession({
        sessionId,
        context: firstContext,
        ttlSeconds: 4 * 60 * 60,
      })
      await registerFmuCapabilityForSession({
        sessionId,
        context: secondContext,
        ttlSeconds: 30 * 60,
      })

      const evaluations = redisCommand.mock.calls
        .map(([command]) => command)
        .filter(([operation]) => operation === 'EVAL')
      expect(evaluations).toHaveLength(2)
      expect(evaluations.every(([operation, script]) => (
        operation === 'EVAL'
        && script.includes("redis.call('SADD'")
        && script.includes("redis.call('TTL'")
        && script.includes("redis.call('EXPIRE'")
        && script.includes('if current_ttl < requested_ttl then')
      ))).toBe(true)
      expect(evaluations.map(([, , , , , ttl]) => ttl)).toEqual(['14400', '1800'])
      expect(redisCommand.mock.calls.some(([command]) => command[0] === 'SADD')).toBe(false)
      expect(redisCommand.mock.calls.some(([command]) => command[0] === 'EXPIRE')).toBe(false)

      await expect(getFmuCapabilitiesForSession(sessionId)).resolves.toEqual(
        expect.arrayContaining([firstContext, secondContext]),
      )
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = originalNodeEnv
      if (originalEncryptionKey === undefined) delete process.env.SESSION_STORE_ENCRYPTION_KEY
      else process.env.SESSION_STORE_ENCRYPTION_KEY = originalEncryptionKey
    }
  })

  test('requests a longer index TTL when a longer capability is registered', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    const originalEncryptionKey = process.env.SESSION_STORE_ENCRYPTION_KEY

    try {
      process.env.NODE_ENV = 'production'
      process.env.SESSION_STORE_ENCRYPTION_KEY = 'a'.repeat(64)
      hasRedisConfig.mockReturnValue(true)
      redisCommand.mockResolvedValue(1)

      await registerFmuCapabilityForSession({
        sessionId,
        context,
        ttlSeconds: 30 * 60,
      })
      await registerFmuCapabilityForSession({
        sessionId,
        context: { ...context, resourceSessionId: 'resource-session-2' },
        ttlSeconds: 4 * 60 * 60,
      })

      const evaluations = redisCommand.mock.calls
        .map(([command]) => command)
        .filter(([operation]) => operation === 'EVAL')
      expect(evaluations.map(([, , , , , ttl]) => ttl)).toEqual(['1800', '14400'])
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = originalNodeEnv
      if (originalEncryptionKey === undefined) delete process.env.SESSION_STORE_ENCRYPTION_KEY
      else process.env.SESSION_STORE_ENCRYPTION_KEY = originalEncryptionKey
    }
  })

  test('persists, reschedules and acknowledges an encrypted revocation entry', async () => {
    const now = Date.now()
    await enqueueFmuRevocation({ sessionId, context, now })

    await expect(getDueFmuRevocations({ now })).resolves.toEqual([
      expect.objectContaining({ sessionId, context, attempts: 0 }),
    ])

    await rescheduleFmuRevocation({ sessionId, context, attempts: 0, now })
    await expect(getDueFmuRevocations({ now: now + 31_000 })).resolves.toEqual([
      expect.objectContaining({ sessionId, context, attempts: 1 }),
    ])

    await ackFmuRevocation({ sessionId, context })
    await expect(getDueFmuRevocations({ now: now + 31_000 })).resolves.toEqual([])
  })

  test('removes only the confirmed capability from a session snapshot', async () => {
    const secondContext = { ...context, resourceSessionId: 'resource-session-2' }
    await registerFmuCapabilityForSession({ sessionId, context, ttlSeconds: 300 })
    await registerFmuCapabilityForSession({ sessionId, context: secondContext, ttlSeconds: 300 })

    await removeFmuCapabilityForSession(sessionId, context)

    await expect(getFmuCapabilitiesForSession(sessionId)).resolves.toEqual([secondContext])
  })
})
