/**
 * Tests for GET /api/contract/institution/getUserReservationByIndex
 *
 * Session-derived params, requires ?index= query param.
 */
import { GET } from '../route'
import { getContractInstance } from '../../../utils/contractInstance'
import { resolveInstitutionAddressFromSession, getSessionPuc } from '../../../utils/institutionSession'
import { BadRequestError, handleGuardError, requireAuth } from '@/utils/auth/guards'

jest.mock('../../../utils/contractInstance', () => ({ getContractInstance: jest.fn() }))
jest.mock('../../../utils/institutionSession', () => ({
  resolveInstitutionAddressFromSession: jest.fn(),
  getSessionPuc: jest.fn(),
}))
jest.mock('@/utils/auth/guards', () => {
  class BadRequestError extends Error { constructor(msg) { super(msg); this.name = 'BadRequestError'; this.code = 'BAD_REQUEST'; this.statusCode = 400 } }
  return {
    BadRequestError,
    requireAuth: jest.fn(),
    handleGuardError: jest.fn((err) => ({ status: err.statusCode || 400, body: { error: err.message } })),
  }
})
jest.mock('@/utils/dev/logger', () => ({ log: jest.fn(), warn: jest.fn(), error: jest.fn() }))

if (!global.Response) {
  global.Response = class {
    static json(data, init) { return { status: init?.status ?? 200, json: async () => data } }
  }
}

const VALID_KEY = '0x' + 'ab'.repeat(32)

describe('GET /api/contract/institution/getUserReservationByIndex', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    requireAuth.mockResolvedValue({ samlAssertion: 'mock' })
    resolveInstitutionAddressFromSession.mockResolvedValue({
      institutionAddress: '0xInstitutionAddr',
      normalizedDomain: 'test.edu',
    })
    getSessionPuc.mockReturnValue('mock-puc')
    getContractInstance.mockResolvedValue({
      getInstitutionalUserReservationByIndex: jest.fn().mockResolvedValue(VALID_KEY),
      getReservation: jest.fn().mockResolvedValue({ labId: BigInt(1), status: BigInt(1), start: BigInt(1000), end: BigInt(2000) }),
    })
  })

  afterEach(() => { console.log.mockRestore(); console.error.mockRestore() })

  function makeRequest(params = {}) {
    return { url: `http://localhost/?${new URLSearchParams(params)}` }
  }

  it('returns 400 when index is missing', async () => {
    await GET(makeRequest())
    expect(handleGuardError).toHaveBeenCalledWith(expect.objectContaining({ name: 'BadRequestError' }))
  })

  it('returns 400 when index is negative', async () => {
    await GET(makeRequest({ index: '-1' }))
    expect(handleGuardError).toHaveBeenCalledWith(expect.objectContaining({ name: 'BadRequestError' }))
  })

  it('returns reservation key on success', async () => {
    const res = await GET(makeRequest({ index: '0' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.reservationKey).toBe(VALID_KEY)
    expect(data.index).toBe(0)
  })

  it('delegates to handleGuardError on auth failure', async () => {
    const err = new Error('Unauthorized'); err.name = 'UnauthorizedError'; err.statusCode = 401
    requireAuth.mockRejectedValue(err)
    await GET(makeRequest({ index: '0' }))
    expect(handleGuardError).toHaveBeenCalledWith(err)
  })
})
