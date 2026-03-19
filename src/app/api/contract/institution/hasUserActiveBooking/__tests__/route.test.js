/**
 * Tests for GET /api/contract/institution/hasUserActiveBooking
 *
 * Session-derived params via institutionSession. No query params needed.
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
  class BadRequestError extends Error { constructor(msg) { super(msg); this.name = 'BadRequestError'; this.code = 'BAD_REQUEST' } }
  return {
    BadRequestError,
    requireAuth: jest.fn(),
    handleGuardError: jest.fn((err) => ({ status: err.statusCode || 400, body: { error: err.message } })),
  }
})

if (!global.Response) {
  global.Response = class {
    static json(data, init) { return { status: init?.status ?? 200, json: async () => data } }
  }
}

describe('GET /api/contract/institution/hasUserActiveBooking', () => {
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
      hasInstitutionalUserActiveBooking: jest.fn().mockResolvedValue(true),
    })
  })

  afterEach(() => { console.log.mockRestore(); console.error.mockRestore() })

  it('returns hasActiveBooking=true when contract returns true', async () => {
    const res = await GET()
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.hasActiveBooking).toBe(true)
  })

  it('returns hasActiveBooking=false when contract returns false', async () => {
    getContractInstance.mockResolvedValue({
      hasInstitutionalUserActiveBooking: jest.fn().mockResolvedValue(false),
    })
    const res = await GET()
    const data = await res.json()
    expect(data.hasActiveBooking).toBe(false)
  })

  it('delegates BadRequestError to handleGuardError', async () => {
    const err = new BadRequestError('Missing affiliation')
    resolveInstitutionAddressFromSession.mockRejectedValue(err)
    await GET()
    expect(handleGuardError).toHaveBeenCalledWith(err)
  })

  it('returns 500 on unexpected contract error', async () => {
    getContractInstance.mockResolvedValue({
      hasInstitutionalUserActiveBooking: jest.fn().mockRejectedValue(new Error('RPC Error')),
    })
    const res = await GET()
    const data = await res.json()
    expect(res.status).toBe(500)
    expect(data.error).toMatch(/Failed to check active booking/)
  })
})
