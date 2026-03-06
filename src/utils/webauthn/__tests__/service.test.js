/**
 * Unit tests for utils/webauthn/service.js
 * Focus on registerCredentialInBackend header logic.
 */

import { registerCredentialInBackend } from '../service'

describe('webauthn service helpers', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = jest.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  const record = { userId: 'u1', credentialId: 'c1' }
  const baseUrl = 'https://institution.example'

  test('sends content-type header only when no token provided', async () => {
    global.fetch.mockResolvedValue({ ok: true })

    await registerCredentialInBackend(record, baseUrl)

    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl.replace(/\/$/, '')}/webauthn/register`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.any(String),
      })
    )
  })

  test('adds Authorization header when backendAuthToken given', async () => {
    global.fetch.mockResolvedValue({ ok: true })

    await registerCredentialInBackend(record, baseUrl, { backendAuthToken: 'tok123' })

    expect(global.fetch).toHaveBeenCalledWith(
      `${baseUrl.replace(/\/$/, '')}/webauthn/register`,
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer tok123',
        },
        body: expect.any(String),
      })
    )
  })
})
