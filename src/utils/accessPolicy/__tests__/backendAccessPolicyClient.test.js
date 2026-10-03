import { evaluateReservationAccess } from '@/utils/accessPolicy/backendAccessPolicyClient'
import { getIntentBackendAuthToken } from '@/utils/intents/backendClient'

jest.mock('@/utils/intents/backendClient', () => ({ getIntentBackendAuthToken: jest.fn() }))

describe('evaluateReservationAccess', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
    getIntentBackendAuthToken.mockResolvedValue({ token: 'service-token' })
  })

  test('sends the institutional session to the canonical backend before booking', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ allowed: true }) })
    await evaluateReservationAccess({ backendUrl: 'https://ib.example/', institutionId: 'uni.example', institutionalSessionToken: 'session', reservation: { labId: 4, price: 2, start: 1, end: 2 } })
    expect(global.fetch).toHaveBeenCalledWith('https://ib.example/access-policy/labs/evaluate', expect.objectContaining({ method: 'POST' }))
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).institutionalSessionToken).toBe('session')
  })

  test('turns a backend deny into a 403 without allowing the caller to continue', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ allowed: false }) })
    await expect(evaluateReservationAccess({ backendUrl: 'https://ib.example', institutionId: 'uni.example', institutionalSessionToken: 'session', reservation: { labId: 4, price: 2 } }))
      .rejects.toMatchObject({ status: 403, code: 'LAB_CATEGORY_ACCESS_DENIED' })
  })
})
