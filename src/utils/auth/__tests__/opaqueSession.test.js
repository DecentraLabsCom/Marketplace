/**
 * @jest-environment node
 */

describe('opaque server-side sessions', () => {
  let createSessionCookie
  let getSessionFromCookies

  beforeEach(async () => {
    jest.resetModules()
    process.env.NODE_ENV = 'test'
    const sessionCookie = await import('../sessionCookie')
    createSessionCookie = sessionCookie.createSessionCookie
    getSessionFromCookies = sessionCookie.getSessionFromCookies
  })

  test('does not place SAML material in the browser cookie', async () => {
    const samlAssertion = Buffer.from('<Assertion>secret identity</Assertion>').toString('base64')
    const cookies = await createSessionCookie({
      id: 'alice@example.edu',
      email: 'alice@example.edu',
      samlAssertion,
    })

    expect(cookies).toHaveLength(1)
    expect(cookies[0].value).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(cookies[0].value).not.toContain(samlAssertion)

    const session = await getSessionFromCookies({
      get: jest.fn().mockReturnValue({ value: cookies[0].value }),
    })

    expect(session).toMatchObject({ id: 'alice@example.edu', samlAssertion })
    expect(session.sessionId).toBe(cookies[0].value)
  })

  test('rejects legacy JWT-like cookie values instead of reading client data', async () => {
    const session = await getSessionFromCookies({
      get: jest.fn().mockReturnValue({ value: 'eyJhbGciOiJIUzI1NiJ9.eyJzYW1sQXNzZXJ0aW9uIjoiZXZpbCJ9.signature' }),
    })

    expect(session).toBeNull()
  })
})
