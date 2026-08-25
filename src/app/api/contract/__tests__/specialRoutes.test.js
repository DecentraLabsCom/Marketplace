/**
 * @jest-environment node
 */

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

jest.mock('@/utils/auth/guards', () => {
  class BadRequestError extends Error {
    constructor(message) {
      super(message)
      this.name = 'BadRequestError'
      this.code = 'BAD_REQUEST'
      this.status = 400
    }
  }

  class ForbiddenError extends Error {
    constructor(message) {
      super(message)
      this.name = 'ForbiddenError'
      this.code = 'FORBIDDEN'
      this.status = 403
    }
  }

  return {
    BadRequestError,
    ForbiddenError,
    requireAuth: jest.fn(),
    handleGuardError: jest.fn((error) => Response.json(
      { error: error?.message || 'guard error', code: error?.code || 'GUARD_ERROR' },
      { status: error?.status || 500 },
    )),
  }
})

jest.mock('@/app/api/contract/utils/institutionSession', () => ({
  getSessionPucHash: jest.fn(),
  resolveInstitutionAddressFromSession: jest.fn(),
}))

jest.mock('@/server/contract/getAllLabProviders', () => ({
  getAllLabProviders: jest.fn(),
}))

jest.mock('@/utils/auth/roleValidation', () => ({
  hasAdminRole: jest.fn(),
}))

import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import {
  BadRequestError,
  ForbiddenError,
  handleGuardError,
  requireAuth,
} from '@/utils/auth/guards'
import {
  getSessionPucHash,
  resolveInstitutionAddressFromSession,
} from '@/app/api/contract/utils/institutionSession'
import { getAllLabProviders } from '@/server/contract/getAllLabProviders'
import { hasAdminRole } from '@/utils/auth/roleValidation'
import { GET as getActiveReservationKey } from '../institution/getActiveReservationKey/route'
import { GET as getReservationByUserIndex } from '../institution/getUserReservationByIndex/route'
import { GET as getUserReservationCount } from '../institution/getUserReservationCount/route'
import { GET as hasUserActiveBooking } from '../institution/hasUserActiveBooking/route'
import { GET as resolveInstitution } from '../institution/resolve/route'
import { GET as getAllLabs } from '../lab/getAllLabs/route'
import { GET as getLabProviders } from '../provider/getLabProviders/route'
import { POST as removeProvider } from '../provider/removeProvider/route'
import { POST as updateProvider } from '../provider/updateProvider/route'

const ADDRESS = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const PUC_HASH = `0x${'22'.repeat(32)}`
const ZERO_BYTES32 = `0x${'00'.repeat(32)}`

const request = (path, init) => new Request(`http://localhost${path}`, init)
const json = (response) => response.json()

describe('special contract adapters', () => {
  let contract
  const session = { id: 'session-1', entitlements: ['admin'] }

  beforeEach(() => {
    contract = {
      getInstitutionalUserActiveReservationKey: jest.fn(),
      getInstitutionalUserReservationByIndex: jest.fn(),
      getReservation: jest.fn(),
      getInstitutionalUserReservationCount: jest.fn(),
      hasInstitutionalUserActiveBooking: jest.fn(),
      resolveSchacHomeOrganization: jest.fn(),
      getSchacHomeOrganizationBackend: jest.fn(),
      getLabsPaginated: jest.fn(),
      ownerOf: jest.fn(),
      removeProvider: jest.fn(),
    }

    getContractInstance.mockResolvedValue(contract)
    requireAuth.mockResolvedValue(session)
    getSessionPucHash.mockReturnValue(PUC_HASH)
    resolveInstitutionAddressFromSession.mockResolvedValue({
      institutionAddress: ADDRESS,
      normalizedDomain: 'uni.example',
    })
    hasAdminRole.mockReturnValue(true)
  })

  test('returns active reservation key and distinguishes the zero sentinel', async () => {
    contract.getInstitutionalUserActiveReservationKey.mockResolvedValue(ZERO_BYTES32)

    const emptyResponse = await getActiveReservationKey(
      request('/api/contract/institution/getActiveReservationKey?labId=7'),
    )

    expect(emptyResponse.status).toBe(200)
    await expect(json(emptyResponse)).resolves.toEqual({
      reservationKey: ZERO_BYTES32,
      hasActiveReservation: false,
      institutionAddress: ADDRESS,
      pucHash: PUC_HASH,
      labId: 7,
      institutionDomain: 'uni.example',
    })

    contract.getInstitutionalUserActiveReservationKey.mockResolvedValue(`0x${'33'.repeat(32)}`)
    const activeResponse = await getActiveReservationKey(
      request('/api/contract/institution/getActiveReservationKey?labId=7'),
    )

    await expect(json(activeResponse)).resolves.toMatchObject({
      reservationKey: `0x${'33'.repeat(32)}`,
      hasActiveReservation: true,
    })
    expect(contract.getInstitutionalUserActiveReservationKey).toHaveBeenLastCalledWith(
      ADDRESS,
      PUC_HASH,
      7,
    )
  })

  test('rejects invalid active-booking parameters before the RPC call', async () => {
    const missing = await getActiveReservationKey(
      request('/api/contract/institution/getActiveReservationKey'),
    )
    const invalid = await hasUserActiveBooking(
      request('/api/contract/institution/hasUserActiveBooking?labId=-1'),
    )

    expect(missing.status).toBe(400)
    expect(invalid.status).toBe(400)
    expect(handleGuardError).toHaveBeenCalled()
    expect(getContractInstance).not.toHaveBeenCalled()
  })

  test('reads user reservation by index and tolerates best-effort debug failures', async () => {
    const key = `0x${'44'.repeat(32)}`
    contract.getInstitutionalUserReservationByIndex.mockResolvedValue(key)
    contract.getReservation.mockRejectedValue(new Error('debug RPC unavailable'))

    const response = await getReservationByUserIndex(
      request('/api/contract/institution/getUserReservationByIndex?index=2'),
    )

    expect(response.status).toBe(200)
    await expect(json(response)).resolves.toEqual({
      reservationKey: key,
      index: 2,
      institutionAddress: ADDRESS,
      institutionDomain: 'uni.example',
    })
    expect(contract.getInstitutionalUserReservationByIndex).toHaveBeenCalledWith(
      ADDRESS,
      PUC_HASH,
      2,
      { from: ADDRESS },
    )
    expect(contract.getReservation).toHaveBeenCalledWith(key)
  })

  test('returns reservation count and a safe empty projection when session context is absent', async () => {
    contract.getInstitutionalUserReservationCount.mockResolvedValue(3n)
    const response = await getUserReservationCount()

    await expect(json(response)).resolves.toEqual({
      count: 3,
      institutionAddress: ADDRESS,
      institutionDomain: 'uni.example',
    })

    resolveInstitutionAddressFromSession.mockRejectedValueOnce(new BadRequestError('missing institution'))
    const fallback = await getUserReservationCount()

    expect(fallback.status).toBe(200)
    await expect(json(fallback)).resolves.toEqual({
      count: 0,
      institutionAddress: null,
      institutionDomain: null,
    })
  })

  test('returns active-booking state with normalized lab id', async () => {
    contract.hasInstitutionalUserActiveBooking.mockResolvedValue(true)

    const response = await hasUserActiveBooking(
      request('/api/contract/institution/hasUserActiveBooking?labId=9'),
    )

    expect(response.status).toBe(200)
    await expect(json(response)).resolves.toEqual({
      hasActiveBooking: true,
      institutionAddress: ADDRESS,
      labId: 9,
      institutionDomain: 'uni.example',
    })
    expect(contract.hasInstitutionalUserActiveBooking).toHaveBeenCalledWith(
      ADDRESS,
      PUC_HASH,
      9,
      { from: ADDRESS },
    )
  })

  test('normalizes institution domains and strips backend auth suffixes', async () => {
    contract.resolveSchacHomeOrganization.mockResolvedValue(ADDRESS.toUpperCase())
    contract.getSchacHomeOrganizationBackend.mockResolvedValue(' https://backend.example/auth/// ')

    const response = await resolveInstitution(
      request('/api/contract/institution/resolve?domain= Uni.Example '),
    )

    expect(response.status).toBe(200)
    await expect(json(response)).resolves.toEqual({
      domain: 'uni.example',
      wallet: ADDRESS,
      registered: true,
      backendUrl: 'https://backend.example',
      hasBackend: true,
    })
    expect(contract.resolveSchacHomeOrganization).toHaveBeenCalledWith('uni.example')
  })

  test('distinguishes unregistered institutions and tolerates backend lookup failure', async () => {
    contract.resolveSchacHomeOrganization.mockResolvedValue('0x0000000000000000000000000000000000000000')
    contract.getSchacHomeOrganizationBackend.mockRejectedValue(new Error('backend lookup failed'))

    const response = await resolveInstitution(
      request('/api/contract/institution/resolve?domain=unknown.example'),
    )

    await expect(json(response)).resolves.toEqual({
      domain: 'unknown.example',
      wallet: null,
      registered: false,
      backendUrl: null,
      hasBackend: false,
    })
  })

  test('validates institution domains and hides contract failures', async () => {
    const missing = await resolveInstitution(request('/api/contract/institution/resolve'))
    const invalid = await resolveInstitution(request('/api/contract/institution/resolve?domain=bad_domain'))

    expect(missing.status).toBe(400)
    expect(invalid.status).toBe(400)
    await expect(json(invalid)).resolves.toMatchObject({ code: 'INVALID_INSTITUTION_DOMAIN' })

    contract.resolveSchacHomeOrganization.mockRejectedValue(new Error('RPC internal detail'))
    const failed = await resolveInstitution(
      request('/api/contract/institution/resolve?domain=uni.example'),
    )
    const failedBody = await json(failed)

    expect(failed.status).toBe(500)
    expect(failedBody).toEqual(expect.objectContaining({ code: 'INSTITUTION_RESOLVE_FAILED' }))
    expect(failedBody.error).not.toContain('RPC internal detail')
  })

  test('lists existing labs, removes stale tokens and keeps unknown RPC failures', async () => {
    contract.getLabsPaginated.mockResolvedValue({
      0: [1n, 2n, 2n, 3n],
      1: 4n,
    })
    contract.ownerOf.mockImplementation((labId) => {
      if (labId === 2) return Promise.reject({ reason: 'ERC721NonexistentToken' })
      if (labId === 3) return Promise.reject(new Error('temporary RPC outage'))
      return Promise.resolve(ADDRESS)
    })

    const response = await getAllLabs()

    expect(response.status).toBe(200)
    await expect(json(response)).resolves.toEqual([1, 3])
    expect(contract.getLabsPaginated).toHaveBeenCalledWith(0, 100)
    expect(contract.ownerOf).toHaveBeenCalledTimes(3)
  })

  test('returns a generic error when the lab index cannot be read', async () => {
    contract.getLabsPaginated.mockRejectedValue(new Error('provider unavailable'))

    const response = await getAllLabs()
    const body = await json(response)

    expect(response.status).toBe(500)
    expect(body).toEqual(expect.objectContaining({
      code: 'LAB_LIST_FAILED',
      error: 'The laboratory list could not be loaded.',
    }))
  })

  test('maps provider pages to the public provider projection', async () => {
    getAllLabProviders.mockResolvedValue([
      {
        account: ADDRESS,
        base: {
          name: 'Provider University',
          email: 'provider@example.edu',
          country: 'ES',
          authURI: 'https://provider.example/auth',
        },
      },
    ])

    const response = await getLabProviders(request('/api/contract/provider/getLabProviders'))
    expect(response.status).toBe(200)
    await expect(json(response)).resolves.toEqual({
      providers: [{
        account: ADDRESS,
        name: 'Provider University',
        email: 'provider@example.edu',
        country: 'ES',
        authURI: 'https://provider.example/auth',
      }],
      count: 1,
      timestamp: expect.any(String),
    })
    expect(getAllLabProviders).toHaveBeenCalledWith(contract, {})
  })

  test('requires admin entitlement and waits for provider removal receipt', async () => {
    const wait = jest.fn().mockResolvedValue({ status: 1 })
    contract.removeProvider.mockResolvedValue({ wait })

    const response = await removeProvider(request('/api/contract/provider/removeProvider', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet: ADDRESS }),
    }))

    expect(response.status).toBe(200)
    await expect(json(response)).resolves.toEqual({
      message: 'Provider removed successfully',
      walletAddress: ADDRESS,
    })
    expect(hasAdminRole).toHaveBeenCalledWith(session.entitlements)
    expect(contract.removeProvider).toHaveBeenCalledWith(ADDRESS)
    expect(wait).toHaveBeenCalledTimes(1)
  })

  test('rejects provider removal without admin privileges or wallet input', async () => {
    hasAdminRole.mockReturnValueOnce(false)
    const forbidden = await removeProvider(request('/api/contract/provider/removeProvider', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet: ADDRESS }),
    }))

    expect(forbidden.status).toBe(403)
    await expect(json(forbidden)).resolves.toEqual({
      error: 'Admin privileges required to remove providers',
      code: 'FORBIDDEN',
    })

    hasAdminRole.mockReturnValue(true)
    const missing = await removeProvider(request('/api/contract/provider/removeProvider', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    }))

    expect(missing.status).toBe(400)
    await expect(json(missing)).resolves.toEqual({ error: 'Missing required fields' })
    expect(getContractInstance).not.toHaveBeenCalled()
  })

  test('keeps provider update behind the wallet-signature or intent boundary', async () => {
    const response = await updateProvider(request('/api/contract/provider/updateProvider', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Provider University',
        email: 'provider@example.edu',
        country: 'ES',
        userAddress: ADDRESS,
      }),
    }))

    expect(response.status).toBe(400)
    await expect(json(response)).resolves.toEqual({
      error: 'Update must be executed with wallet signature or SSO intent',
      hint: 'Wallet: call updateProvider on-chain with signer. SSO: use institutional intent flow.',
    })
    expect(getContractInstance).not.toHaveBeenCalled()
  })

  test('validates provider update fields before returning the execution guidance', async () => {
    const response = await updateProvider(request('/api/contract/provider/updateProvider', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Provider University' }),
    }))

    expect(response.status).toBe(400)
    await expect(json(response)).resolves.toEqual({
      error: 'Missing required fields: name, email, country, userAddress',
    })
  })
})
