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

  test('encrypts the SAML assertion before sending the session record to REST storage', async () => {
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
    expect(storedRecord.samlAssertion).toMatch(/^enc:v1:/)
    expect(storedRecord.samlAssertion).not.toContain(assertion)
  })
})

