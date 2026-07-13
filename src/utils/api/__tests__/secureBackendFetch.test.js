import { lookup } from 'node:dns/promises'
import { Agent, fetch as undiciFetch } from 'undici'
import { secureBackendJsonRequest } from '@/utils/api/secureBackendFetch'

const close = jest.fn()

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(),
}))

jest.mock('undici', () => ({
  Agent: jest.fn(() => ({ close })),
  fetch: jest.fn(),
}))

describe('secureBackendJsonRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    undiciFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ status: 'ok' }),
    })
  })

  test('pins a validated DNS result and refuses redirects', async () => {
    const result = await secureBackendJsonRequest(
      'https://trusted.example',
      '/intents/request-1',
      { method: 'GET', headers: { Authorization: 'Bearer token' } }
    )

    expect(Agent).toHaveBeenCalledWith(expect.objectContaining({ connect: expect.any(Object) }))
    expect(undiciFetch).toHaveBeenCalledWith(
      'https://trusted.example/intents/request-1',
      expect.objectContaining({
        method: 'GET',
        redirect: 'error',
        dispatcher: expect.any(Object),
      })
    )
    expect(result).toEqual({ ok: true, status: 200, data: { status: 'ok' } })
    expect(close).toHaveBeenCalled()
  })

  test('does not connect when DNS resolves to a private address', async () => {
    lookup.mockResolvedValueOnce([{ address: '10.0.0.8', family: 4 }])

    await expect(secureBackendJsonRequest('https://trusted.example', '/intents/request-1'))
      .rejects.toThrow('public')
    expect(undiciFetch).not.toHaveBeenCalled()
  })

  test('preserves the gateway auth prefix registered on-chain', async () => {
    await secureBackendJsonRequest(
      'https://trusted.example/auth',
      '/intents/request-1',
      { method: 'GET' }
    )

    expect(undiciFetch).toHaveBeenCalledWith(
      'https://trusted.example/auth/intents/request-1',
      expect.objectContaining({ redirect: 'error' })
    )
  })
})
