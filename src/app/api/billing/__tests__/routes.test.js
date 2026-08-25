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

jest.mock('@/utils/auth/guards', () => ({
  handleGuardError: jest.fn((error) => Response.json(
    { error: error?.message || 'guard error', code: error?.code || 'GUARD_ERROR' },
    { status: error?.status || 500 },
  )),
  ForbiddenError: class ForbiddenError extends Error {
    constructor(message) {
      super(message)
      this.name = 'ForbiddenError'
      this.code = 'FORBIDDEN'
      this.status = 403
    }
  },
}))

jest.mock('@/utils/security/publicError', () => ({
  publicErrorResponse: jest.fn(({ status, code, message }) => Response.json(
    { error: message, code },
    { status },
  )),
}))

import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { resolveInstitutionAddressFromSession } from '@/app/api/contract/utils/institutionSession'
import {
  resolveBackendUrlForSession,
  resolveForwardHeaders,
} from '@/utils/api/backendProxyHelpers'
import { institutionalBackendFetch } from '@/utils/api/gatewayProxy'
import { handleGuardError } from '@/utils/auth/guards'
import { publicErrorResponse } from '@/utils/security/publicError'
import { GET as getCreditAccount } from '../credit-account/route'
import { GET as getCreditLots } from '../credit-account/lots/route'
import { GET as getCreditMovements } from '../credit-account/movements/route'
import { GET as getFundingOrders } from '../funding-orders/route'

const INSTITUTION_ADDRESS = '0x1234567890123456789012345678901234567890'
const BACKEND_URL = 'https://gateway.example.edu'
const SERVICE_TOKEN = 'server-only-billing-token'

const request = (path) => new Request(`https://market.example${path}`)
const json = (response) => response.json()

describe('institutional billing HTTP routes', () => {
  const routeCases = [
    {
      name: 'credit account summary',
      handler: getCreditAccount,
      path: '/api/billing/credit-account',
      upstreamPath: `/billing/credit-accounts/${INSTITUTION_ADDRESS}`,
    },
    {
      name: 'credit lots',
      handler: getCreditLots,
      path: '/api/billing/credit-account/lots',
      upstreamPath: `/billing/credit-accounts/${INSTITUTION_ADDRESS}/lots`,
    },
    {
      name: 'funding orders',
      handler: getFundingOrders,
      path: '/api/billing/funding-orders',
      upstreamPath: `/billing/funding-orders?institution=${INSTITUTION_ADDRESS}`,
    },
  ]

  beforeEach(() => {
    resolveBackendUrlForSession.mockResolvedValue({
      backendUrl: BACKEND_URL,
      session: { id: 'session-1', isSSO: true },
      institutionDomain: 'uni.example',
    })
    resolveForwardHeaders.mockResolvedValue({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_TOKEN}`,
    })
    getContractInstance.mockResolvedValue({})
    resolveInstitutionAddressFromSession.mockResolvedValue({
      institutionAddress: INSTITUTION_ADDRESS,
    })
    institutionalBackendFetch.mockImplementation(() => Promise.resolve(new Response(
      JSON.stringify({ balance: '42', tokenShouldStayServerSide: true }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )))
  })

  test.each(routeCases)('proxies $name through the authenticated institution', async ({ handler, path, upstreamPath }) => {
    const response = await handler(request(path))

    expect(response.status).toBe(200)
    await expect(json(response)).resolves.toEqual({
      balance: '42',
      tokenShouldStayServerSide: true,
    })
    expect(response.headers.get('authorization')).toBeNull()
    expect(response.headers.get('www-authenticate')).toBeNull()
    expect(institutionalBackendFetch).toHaveBeenCalledWith(
      `${BACKEND_URL}${upstreamPath}`,
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_TOKEN}`,
        },
        cache: 'no-store',
      }),
    )
    expect(resolveForwardHeaders).toHaveBeenCalledWith({
      backendUrl: BACKEND_URL,
      institutionId: 'uni.example',
      scope: 'billing:read',
    })
  })

  test('proxies movements with the bounded request limit at the HTTP boundary', async () => {
    const limits = [
      ['1', '1'],
      ['45', '45'],
      ['1000', '100'],
      ['0', '20'],
      ['not-a-number', '20'],
    ]

    for (const [requested, forwarded] of limits) {
      institutionalBackendFetch.mockClear()

      const response = await getCreditMovements(
        request(`/api/billing/credit-account/movements?limit=${requested}`),
      )

      expect(response.status).toBe(200)
      expect(institutionalBackendFetch).toHaveBeenCalledWith(
        `${BACKEND_URL}/billing/credit-accounts/${INSTITUTION_ADDRESS}/movements?limit=${forwarded}`,
        expect.any(Object),
      )
    }
  })

  test('rejects a non-SSO session before resolving the institution or calling the backend', async () => {
    resolveBackendUrlForSession.mockResolvedValue({
      backendUrl: BACKEND_URL,
      session: { id: 'session-1', isSSO: false },
      institutionDomain: 'uni.example',
    })

    const response = await getCreditAccount(request('/api/billing/credit-account'))

    expect(response.status).toBe(403)
    await expect(json(response)).resolves.toEqual({
      error: 'Institutional SSO session required',
      code: 'FORBIDDEN',
    })
    expect(handleGuardError).toHaveBeenCalled()
    expect(resolveInstitutionAddressFromSession).not.toHaveBeenCalled()
    expect(institutionalBackendFetch).not.toHaveBeenCalled()
  })

  test('preserves the authentication boundary when the session is missing', async () => {
    resolveBackendUrlForSession.mockRejectedValue({
      name: 'UnauthorizedError',
      code: 'UNAUTHORIZED',
      status: 401,
      message: 'Authentication required',
    })

    const response = await getCreditLots(request('/api/billing/credit-account/lots'))

    expect(response.status).toBe(401)
    await expect(json(response)).resolves.toEqual({
      error: 'Authentication required',
      code: 'UNAUTHORIZED',
    })
    expect(handleGuardError).toHaveBeenCalled()
    expect(institutionalBackendFetch).not.toHaveBeenCalled()
  })

  test('returns 424 when the authenticated institution has no configured backend', async () => {
    resolveBackendUrlForSession.mockResolvedValue({
      backendUrl: null,
      session: { id: 'session-1', isSSO: true },
      institutionDomain: 'uni.example',
    })

    const response = await getFundingOrders(request('/api/billing/funding-orders'))

    expect(response.status).toBe(424)
    await expect(json(response)).resolves.toEqual({
      error: 'The institutional billing service is not configured.',
      code: 'BACKEND_NOT_CONFIGURED',
    })
    expect(getContractInstance).not.toHaveBeenCalled()
    expect(resolveForwardHeaders).not.toHaveBeenCalled()
    expect(institutionalBackendFetch).not.toHaveBeenCalled()
  })

  test('maps upstream not-found and failure responses without leaking backend details', async () => {
    institutionalBackendFetch.mockResolvedValueOnce(new Response('', { status: 404 }))
    const notFound = await getCreditAccount(request('/api/billing/credit-account'))

    expect(notFound.status).toBe(404)
    await expect(json(notFound)).resolves.toBeNull()

    institutionalBackendFetch.mockResolvedValueOnce(new Response(
      JSON.stringify({ stack: 'backend-internal-stack', token: SERVICE_TOKEN }),
      { status: 503, headers: { 'content-type': 'application/json' } },
    ))
    const failed = await getCreditLots(request('/api/billing/credit-account/lots'))
    const failedBody = await json(failed)

    expect(failed.status).toBe(502)
    expect(failedBody).toEqual({
      error: 'The institutional billing service is temporarily unavailable.',
      code: 'BILLING_UNAVAILABLE',
    })
    expect(JSON.stringify(failedBody)).not.toContain(SERVICE_TOKEN)
    expect(publicErrorResponse).toHaveBeenCalledWith(expect.objectContaining({
      status: 502,
      code: 'BILLING_UNAVAILABLE',
    }))
  })

  test('does not expose the server credential when token creation or institution lookup fails', async () => {
    resolveForwardHeaders.mockRejectedValueOnce(new Error(`credential ${SERVICE_TOKEN} failed`))
    const tokenFailure = await getCreditMovements(
      request('/api/billing/credit-account/movements?limit=20'),
    )
    const tokenFailureBody = await json(tokenFailure)

    expect(tokenFailure.status).toBe(502)
    expect(JSON.stringify(tokenFailureBody)).not.toContain(SERVICE_TOKEN)
    expect(tokenFailureBody).toEqual({
      error: 'The institutional billing service could not be reached.',
      code: 'BILLING_PROXY_FAILED',
    })

    resolveInstitutionAddressFromSession.mockRejectedValueOnce({
      name: 'BadRequestError',
      code: 'BAD_REQUEST',
      status: 400,
      message: 'Institution context missing',
    })
    const institutionFailure = await getCreditAccount(request('/api/billing/credit-account'))

    expect(institutionFailure.status).toBe(400)
    await expect(json(institutionFailure)).resolves.toEqual({
      error: 'Institution context missing',
      code: 'BAD_REQUEST',
    })
    expect(institutionalBackendFetch).not.toHaveBeenCalled()
  })
})
