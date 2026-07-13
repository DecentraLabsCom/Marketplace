import { establishFmuGatewaySession } from '../fmuAccess'

describe('establishFmuGatewaySession', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })

  test('exchanges the opaque code through the same-origin BFF and keeps gateway credentials out of JavaScript', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ gatewayOrigin: 'https://gateway.example.com' }),
    })

    await expect(
      establishFmuGatewaySession({
        labURL: 'https://gateway.example.com/fmu/',
        accessCode: 'opaque-code',
        labId: '42',
        reservationKey: '0xabc',
      }),
    ).resolves.toBe('https://gateway.example.com')

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/fmu-session',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const request = global.fetch.mock.calls[0][1]
    expect(JSON.parse(request.body)).toEqual({
      labURL: 'https://gateway.example.com/fmu/',
      accessCode: 'opaque-code',
      labId: '42',
      reservationKey: '0xabc',
    })
    expect(JSON.stringify(request)).not.toContain('technical')
  })

  test('rejects a failed exchange', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 401 })

    await expect(
      establishFmuGatewaySession({
        labURL: 'https://gateway.example.com/fmu/',
        accessCode: 'expired-code',
        labId: '42',
        reservationKey: '0xabc',
      }),
    ).rejects.toThrow('FMU access-code exchange failed (401)')
  })
})
