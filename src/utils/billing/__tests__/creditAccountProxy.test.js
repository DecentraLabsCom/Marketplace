/**
 * @jest-environment node
 */

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

jest.mock('@/app/api/contract/utils/institutionSession', () => ({
  resolveInstitutionAddressFromSession: jest.fn(),
}))

jest.mock('@/utils/api/backendProxyHelpers', () => ({
  resolveBackendUrlForSession: jest.fn(),
  resolveForwardHeaders: jest.fn(),
}))

jest.mock('@/utils/api/gatewayProxy', () => ({
  institutionalBackendFetch: jest.fn(),
}))

jest.mock('@/utils/auth/guards', () => {
  class ForbiddenError extends Error {
    constructor(message) {
      super(message)
      this.name = 'ForbiddenError'
    }
  }
  return { ForbiddenError }
})

jest.mock('@/utils/security/publicError', () => ({
  publicErrorResponse: jest.fn(({ status, code, message }) => new Response(
    JSON.stringify({ code, message }),
    { status },
  )),
}))

import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { resolveInstitutionAddressFromSession } from '@/app/api/contract/utils/institutionSession'
import { resolveBackendUrlForSession, resolveForwardHeaders } from '@/utils/api/backendProxyHelpers'
import { institutionalBackendFetch } from '@/utils/api/gatewayProxy'
import { proxyCreditAccount } from '../creditAccountProxy'

describe('institutional credit-account proxy', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resolveForwardHeaders.mockResolvedValue({ Authorization: 'Bearer marketplace-token' })
    getContractInstance.mockResolvedValue({})
    resolveInstitutionAddressFromSession.mockResolvedValue({
      institutionAddress: '0x1234567890123456789012345678901234567890',
    })
  })

  test('rejects a non-SSO session before it can reach institutional billing', async () => {
    resolveBackendUrlForSession.mockResolvedValue({
      backendUrl: 'https://gateway.example.edu',
      session: { id: 'user-1', isSSO: false },
    })

    await expect(proxyCreditAccount(
      'funding-orders',
      new Request('https://market.example/api/billing/funding-orders?institution=0xattacker'),
    )).rejects.toMatchObject({ name: 'ForbiddenError' })

    expect(institutionalBackendFetch).not.toHaveBeenCalled()
    expect(resolveInstitutionAddressFromSession).not.toHaveBeenCalled()
  })

  test('derives the billing account from the authenticated institution, not a client query parameter', async () => {
    resolveBackendUrlForSession.mockResolvedValue({
      backendUrl: 'https://gateway.example.edu',
      session: { id: 'user-1', isSSO: true, schacHomeOrganization: 'example.edu' },
    })
    institutionalBackendFetch.mockResolvedValue(new Response(
      JSON.stringify({ balance: '42' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ))

    const response = await proxyCreditAccount(
      'summary',
      new Request('https://market.example/api/billing/credit-account?institution=0xattacker'),
    )

    expect(response.status).toBe(200)
    expect(institutionalBackendFetch).toHaveBeenCalledWith(
      'https://gateway.example.edu/billing/credit-accounts/0x1234567890123456789012345678901234567890',
      expect.objectContaining({
        headers: { Authorization: 'Bearer marketplace-token' },
      }),
    )
  })
})
