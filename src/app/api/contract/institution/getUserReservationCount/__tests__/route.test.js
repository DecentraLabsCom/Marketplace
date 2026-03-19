/**
 * Tests for GET /api/contract/institution/getUserReservationCount
 *
 * Derives institution and puc from session via institutionSession utilities.
 */
import { GET } from '../route'
import { getContractInstance } from '../../../utils/contractInstance'
import { resolveInstitutionAddressFromSession, getSessionPuc } from '../../../utils/institutionSession'
import { handleGuardError, requireAuth } from '@/utils/auth/guards'

jest.mock('../../../utils/contractInstance', () => ({ getContractInstance: jest.fn() }))
jest.mock('../../../utils/institutionSession', () => ({
  resolveInstitutionAddressFromSession: jest.fn(),
  getSessionPuc: jest.fn(),
}))
jest.mock('@/utils/auth/guards', () => ({
  requireAuth: jest.fn(),
  BadRequestError: class BadRequestError extends Error { constructor(msg) { super(msg); this.name = 'BadRequestError'; this.code = 'BAD_REQUEST' } },
  handleGuardError: jest.fn((err) => ({ status: err.statusCode || 400, body: { error: err.message } })),
}))
jest.mock('@/utils/dev/logger', () => ({ log: jest.fn(), warn: jest.fn(), error: jest.fn() }))

if (!global.Response) {
  global.Response = class {
    static json(data, init) { return { status: init?.status ?? 200, json: async () => data } }
  }
}

describe('GET /api/contract/institution/getUserReservationCount', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    requireAuth.mockResolvedValue({ samlAssertion: 'mock', user: { email: 'test@test.edu' } })
    resolveInstitutionAddressFromSession.mockResolvedValue({
      institutionAddress: '0xInstitutionAddr',
      normalizedDomain: 'test.edu',
    })
    getSessionPuc.mockReturnValue('mock-puc')
    getContractInstance.mockResolvedValue({
      getInstitutionalUserReservationCount: jest.fn().mockResolvedValue(BigInt(5)),
    })
  })

  afterEach(() => { console.log.mockRestore(); console.error.mockRestore() })

  it('returns count from contract on success', async () => {
    const res = await GET({ url: 'http://localhost/' })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.count).toBe(5)
    expect(data.institutionAddress).toBe('0xInstitutionAddr')
  })

  it('returns count=0 for non-SSO session (missing affiliation domain)', async () => {
    const err = new Error('affiliation domain not found')
    err.code = 'BAD_REQUEST'
    resolveInstitutionAddressFromSession.mockRejectedValue(err)
    const res = await GET({ url: 'http://localhost/' })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.count).toBe(0)
    expect(data.institutionAddress).toBeNull()
  })

  it('delegates to handleGuardError when requireAuth fails', async () => {
    const err = new Error('Unauthorized'); err.name = 'UnauthorizedError'; err.statusCode = 401
    requireAuth.mockRejectedValue(err)
    await GET({ url: 'http://localhost/' })
    expect(handleGuardError).toHaveBeenCalledWith(err)
  })
})
