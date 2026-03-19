/**
 * Tests for GET /api/contract/reservation/hasActiveBookingByToken
 * Auth-gated, NextResponse. Requires tokenId and user.
 */
import { GET } from '../route'
import { getContractInstance } from '../../../utils/contractInstance'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'

jest.mock('next/server', () => ({
  NextResponse: { json: jest.fn((data, init) => ({ status: init?.status ?? 200, body: data })) }
}))
jest.mock('../../../utils/contractInstance', () => ({ getContractInstance: jest.fn() }))
jest.mock('@/utils/auth/guards', () => ({
  requireAuth: jest.fn(),
  handleGuardError: jest.fn((err) => ({ status: 401, body: { error: err.message } })),
}))

function makeRequest(params = {}) {
  return { url: `http://localhost/?${new URLSearchParams(params)}` }
}

describe('GET /api/contract/reservation/hasActiveBookingByToken', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    requireAuth.mockResolvedValue({})
    getContractInstance.mockResolvedValue({
      hasActiveBookingByToken: jest.fn().mockResolvedValue(true),
    })
  })

  afterEach(() => { console.error.mockRestore() })

  it('handles auth errors', async () => {
    requireAuth.mockRejectedValue(new Error('Unauthorized'))
    await GET(makeRequest({}))
    expect(handleGuardError).toHaveBeenCalled()
  })

  it('returns 400 when missing parameters', async () => {
    const res = await GET(makeRequest({ tokenId: '1' }))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing required parameters/)
  })

  it('returns boolean on success', async () => {
    const res = await GET(makeRequest({ tokenId: '1', user: '0x1' }))
    expect(res.status).toBe(200)
    expect(res.body.hasActiveBooking).toBe(true)
    expect(res.body.tokenId).toBe('1')
    expect(res.body.user).toBe('0x1')
  })

  it('returns 500 on contract error', async () => {
    getContractInstance.mockResolvedValue({
      hasActiveBookingByToken: jest.fn().mockRejectedValue(new Error('RPC Error')),
    })
    const res = await GET(makeRequest({ tokenId: '1', user: '0x1' }))
    expect(res.status).toBe(500)
  })
})
