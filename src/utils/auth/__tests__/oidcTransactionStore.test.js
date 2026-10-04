jest.mock('@/utils/redis/restClient', () => ({
  hasRedisConfig: jest.fn(() => true),
  redisCommand: jest.fn(),
}))

import { redisCommand } from '@/utils/redis/restClient'
import {
  clearOidcTransactionStore,
  consumeOidcTransaction,
  saveOidcTransaction,
} from '@/utils/auth/oidcTransactionStore'

describe('OIDC transaction store', () => {
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    process.env.NODE_ENV = 'test'
    jest.clearAllMocks()
    clearOidcTransactionStore()
  })

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  test('consumes a transaction only once and binds it to its provider', async () => {
    const transaction = {
      state: 'state-1',
      nonce: 'nonce-1',
      codeVerifier: 'verifier-1',
      redirectUri: 'https://marketplace.example/callback',
      provider: 'entra-id',
    }
    await saveOidcTransaction(transaction, 60)

    expect(await consumeOidcTransaction('state-1', 'cilogon')).toBeNull()
    await saveOidcTransaction(transaction, 60)
    expect(await consumeOidcTransaction('state-1', 'entra-id')).toMatchObject(transaction)
    expect(await consumeOidcTransaction('state-1', 'entra-id')).toBeNull()
  })

  test('uses atomic Redis consume for a production-safe one-time transaction', async () => {
    process.env.NODE_ENV = 'development'
    redisCommand.mockResolvedValueOnce('OK').mockResolvedValueOnce(JSON.stringify({
      state: 'state-redis',
      nonce: 'nonce-redis',
      codeVerifier: 'verifier-redis',
      redirectUri: 'https://marketplace.example/callback',
      provider: 'entra-id',
      expiresAt: Date.now() + 60_000,
    }))

    await saveOidcTransaction({
      state: 'state-redis',
      nonce: 'nonce-redis',
      codeVerifier: 'verifier-redis',
      redirectUri: 'https://marketplace.example/callback',
      provider: 'entra-id',
    }, 60)
    await consumeOidcTransaction('state-redis', 'entra-id')

    expect(redisCommand.mock.calls[0][0]).toEqual(expect.arrayContaining(['SET', 'NX', 'EX']))
    expect(redisCommand.mock.calls[1][0][0]).toBe('GETDEL')
  })
})
