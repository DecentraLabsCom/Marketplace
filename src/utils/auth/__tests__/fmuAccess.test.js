import { establishFmuGatewaySession } from '../fmuAccess'

describe('establishFmuGatewaySession', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })

  test('exchanges the opaque code at the gateway and keeps the technical JWT out of JavaScript', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 204 })

    await expect(
      establishFmuGatewaySession('https://gateway.example.com/fmu/', 'opaque-code'),
    ).resolves.toBe('https://gateway.example.com')

    expect(global.fetch).toHaveBeenCalledWith(
      'https://gateway.example.com/auth/access',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: expect.any(URLSearchParams),
      }),
    )
    const request = global.fetch.mock.calls[0][1]
    expect(request.body.get('access_code')).toBe('opaque-code')
    expect(JSON.stringify(request)).not.toContain('technical')
  })

  test('rejects a failed exchange', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 401 })

    await expect(
      establishFmuGatewaySession('https://gateway.example.com/fmu/', 'expired-code'),
    ).rejects.toThrow('FMU access-code exchange failed (401)')
  })
})
