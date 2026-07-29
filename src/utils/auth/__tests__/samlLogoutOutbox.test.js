/** @jest-environment node */

jest.mock('@/utils/redis/restClient', () => ({
  hasRedisConfig: jest.fn(),
  redisCommand: jest.fn(),
}))

import { hasRedisConfig } from '@/utils/redis/restClient'
import {
  acceptSamlLogoutRequest,
  clearSamlLogoutOutboxForTests,
  completeSamlLogoutRequest,
  getDueSamlLogoutRequests,
  rescheduleSamlLogoutRequest,
} from '../samlLogoutOutbox'

describe('SAML logout outbox', () => {
  const request = {
    requestId: '_logout-1',
    nameId: 'name-id-1',
    sessionIndex: 'session-index-1',
  }

  beforeEach(() => {
    process.env.NODE_ENV = 'test'
    hasRedisConfig.mockReturnValue(false)
    clearSamlLogoutOutboxForTests()
  })

  test('accepts a request once and keeps pending requests retryable', async () => {
    await expect(acceptSamlLogoutRequest(request)).resolves.toMatchObject({
      status: 'pending',
      record: expect.objectContaining(request),
    })
    await expect(acceptSamlLogoutRequest(request)).resolves.toMatchObject({
      status: 'pending',
      record: expect.objectContaining(request),
    })
    await expect(getDueSamlLogoutRequests()).resolves.toHaveLength(1)
  })

  test('marks completed requests non-replayable and removes them from the due index', async () => {
    await acceptSamlLogoutRequest(request)
    await completeSamlLogoutRequest(request.requestId)

    await expect(acceptSamlLogoutRequest(request)).resolves.toMatchObject({ status: 'completed' })
    await expect(getDueSamlLogoutRequests()).resolves.toEqual([])
  })

  test('rejects reuse of a request ID for another SAML session binding', async () => {
    await acceptSamlLogoutRequest(request)

    await expect(acceptSamlLogoutRequest({
      ...request,
      sessionIndex: 'different-session-index',
    })).rejects.toThrow('outbox binding')
  })

  test('reschedules a pending request with an increasing attempt count', async () => {
    const accepted = await acceptSamlLogoutRequest(request)
    await rescheduleSamlLogoutRequest({
      requestId: request.requestId,
      attempts: accepted.record.attempts,
    })

    await expect(getDueSamlLogoutRequests({ now: Date.now() + 31_000 })).resolves.toEqual([
      expect.objectContaining({
        requestId: request.requestId,
        attempts: 1,
      }),
    ])
  })
})
