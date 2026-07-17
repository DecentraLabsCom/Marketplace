/**
 * @jest-environment node
 */

describe('server-side session store', () => {
  const originalEnv = process.env
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.resetModules()
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      SESSION_STORE_REST_URL: 'https://session-store.example.com',
      SESSION_STORE_REST_TOKEN: 'test-token',
      SESSION_ENCRYPTION_KEY: 'a'.repeat(64),
    }
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'OK' }),
    })
  })

  afterEach(() => {
    process.env = originalEnv
    global.fetch = originalFetch
  })

  test('encrypts the complete identity record before sending it to REST storage', async () => {
    const { createServerSession } = await import('../sessionStore')
    const assertion = '<Assertion>private identity material</Assertion>'

    const { sessionId } = await createServerSession({
      id: 'user-1',
      email: 'user@example.com',
      samlAssertion: assertion,
    })

    const command = JSON.parse(global.fetch.mock.calls[0][1].body)
    const storedRecord = JSON.parse(command[2])

    expect(sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(command.slice(0, 2)).toEqual(['SET', expect.stringContaining(sessionId)])
    expect(command.slice(3)).toEqual(['EX', String(30 * 60)])
    expect(Object.keys(storedRecord)).toEqual(['encryptedSession'])
    expect(storedRecord.encryptedSession).toMatch(/^enc:v1:/)
    expect(storedRecord.encryptedSession).not.toContain(assertion)
    expect(storedRecord.encryptedSession).not.toContain('user@example.com')
  })

  test('does not shorten the Marketplace session to the SAML assertion lifetime', async () => {
    const { createServerSession } = await import('../sessionStore')

    await createServerSession({
      id: 'user-1',
      email: 'user@example.com',
      samlExpiresAt: Date.now() + 60 * 1000,
    })

    const command = JSON.parse(global.fetch.mock.calls[0][1].body)
    expect(command.slice(3)).toEqual(['EX', String(30 * 60)])
  })

  test('does not use SESSION_SECRET as the encryption key in production', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.SESSION_ENCRYPTION_KEY
    process.env.SESSION_SECRET = 'a-session-signing-secret'
    const { createServerSession } = await import('../sessionStore')

    await expect(createServerSession({ id: 'user-1' }))
      .rejects.toThrow('A server-side session encryption key is required in production')
  })

  test('retries transient session-store failures and opens a circuit after repeated failures', async () => {
    process.env.SESSION_STORE_MAX_ATTEMPTS = '2'
    process.env.SESSION_STORE_CIRCUIT_FAILURES = '3'
    global.fetch = jest.fn().mockRejectedValue(new Error('network unavailable'))
    const { clearMemorySessionsForTests, createServerSession } = await import('../sessionStore')
    clearMemorySessionsForTests()

    await expect(createServerSession({ id: 'user-1' })).rejects.toThrow('temporarily unavailable')
    await expect(createServerSession({ id: 'user-2' })).rejects.toThrow('temporarily unavailable')
    await expect(createServerSession({ id: 'user-3' })).rejects.toThrow('temporarily unavailable')
    expect(global.fetch).toHaveBeenCalledTimes(6)

    await expect(createServerSession({ id: 'user-4' })).rejects.toThrow('temporarily unavailable')
    expect(global.fetch).toHaveBeenCalledTimes(6)
  })
})
