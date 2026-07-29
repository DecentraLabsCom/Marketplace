/** @jest-environment node */

import { drainFmuRevocationOutbox } from '@/utils/auth/revokeFmuContexts'
import { drainSamlLogoutOutbox } from '@/utils/auth/processSamlLogout'
import { POST } from '../route'

jest.mock('@/utils/auth/revokeFmuContexts', () => ({
  drainFmuRevocationOutbox: jest.fn(),
}))
jest.mock('@/utils/auth/processSamlLogout', () => ({
  drainSamlLogoutOutbox: jest.fn(),
}))

describe('FMU revocation reconciliation route', () => {
  const originalToken = process.env.FMU_REVOCATION_RECONCILIATION_TOKEN

  beforeEach(() => {
    process.env.FMU_REVOCATION_RECONCILIATION_TOKEN = 'worker-secret'
    jest.clearAllMocks()
    drainFmuRevocationOutbox.mockResolvedValue({ checked: 1, confirmed: 1, pending: 0 })
    drainSamlLogoutOutbox.mockResolvedValue({ checked: 1, completed: 1, pending: 0 })
  })

  afterAll(() => {
    if (originalToken === undefined) delete process.env.FMU_REVOCATION_RECONCILIATION_TOKEN
    else process.env.FMU_REVOCATION_RECONCILIATION_TOKEN = originalToken
  })

  test('requires the reconciliation bearer token', async () => {
    const response = await POST(new Request('https://marketplace.example/api/internal/fmu-revocation'))

    expect(response.status).toBe(401)
    expect(drainFmuRevocationOutbox).not.toHaveBeenCalled()
  })

  test('drains the durable outbox for an authorized worker', async () => {
    const response = await POST(new Request(
      'https://marketplace.example/api/internal/fmu-revocation',
      { method: 'POST', headers: { Authorization: 'Bearer worker-secret' } },
    ))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      fmu: { checked: 1, confirmed: 1, pending: 0 },
      samlLogout: { checked: 1, completed: 1, pending: 0 },
    })
    expect(drainFmuRevocationOutbox).toHaveBeenCalledTimes(1)
    expect(drainSamlLogoutOutbox).toHaveBeenCalledTimes(1)
  })
})
