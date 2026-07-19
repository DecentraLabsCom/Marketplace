/** @jest-environment node */

jest.mock('@/utils/redis/restClient', () => ({
  hasRedisConfig: jest.fn(),
  redisCommand: jest.fn(),
}))

import { hasRedisConfig, redisCommand } from '@/utils/redis/restClient'
import {
  clearSamlLogoutReplayStoreForTests,
  consumeSamlLogoutRequestId,
} from '../samlLogoutReplayStore'

describe('SAML logout request replay store', () => {
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    jest.clearAllMocks()
    clearSamlLogoutReplayStoreForTests()
    process.env.NODE_ENV = 'development'
    hasRedisConfig.mockReturnValue(true)
    redisCommand.mockResolvedValue('OK')
  })

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  test('atomically registers the hashed request ID with the replay validity', async () => {
    await expect(consumeSamlLogoutRequestId('_logout-1')).resolves.toBe(true)

    expect(redisCommand).toHaveBeenCalledWith([
      'SET',
      expect.stringMatching(/^logout-request:[a-f0-9]{64}$/),
      '1',
      'NX',
      'EX',
      '300',
    ])
  })

  test('reports a replay when Redis refuses the NX write', async () => {
    redisCommand.mockResolvedValue(null)

    await expect(consumeSamlLogoutRequestId('_logout-1')).resolves.toBe(false)
  })

  test('fails closed in production when distributed replay storage is unavailable', async () => {
    process.env.NODE_ENV = 'production'
    hasRedisConfig.mockReturnValue(false)

    await expect(consumeSamlLogoutRequestId('_logout-1'))
      .rejects.toThrow('A distributed SAML logout replay store is required in production')
    expect(redisCommand).not.toHaveBeenCalled()
  })
})
