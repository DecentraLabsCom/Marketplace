/**
 * Tests for GET /api/contract/reservation/hasActiveBooking
 * Auth-gated, NextResponse. Requires reservationKey and userAddress.
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

describe('GET /api/contract/reservation/hasActiveBooking', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    requireAuth.mockResolvedValue({})
    getContractInstance.mockResolvedValue({
      hasActiveBooking: jest.fn().mockResolvedValue(true),
    })
  })

  afterEach(() => { console.error.mockRestore() })

  it('handles auth errors', async () => {
    requireAuth.mockRejectedValue(new Error('Unauthorized'))
    await GET(makeRequest({}))
    expect(handleGuardError).toHaveBeenCalled()
  })

  it('returns 400 when params are missing', async () => {
    const res = await GET(makeRequest({ reservationKey: '0x1' }))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing required parameters/)
  })

  it('returns boolean on success', async () => {
    const res = await GET(makeRequest({ reservationKey: '0x1', userAddress: '0xabc' }))
    expect(res.status).toBe(200)
    expect(res.body.hasActiveBooking).toBe(true)
  })

  it('returns 500 on contract error', async () => {
    getContractInstance.mockResolvedValue({
      hasActiveBooking: jest.fn().mockRejectedValue(new Error('RPC Error')),
    })
    const res = await GET(makeRequest({ reservationKey: '0x1', userAddress: '0xabc' }))
    expect(res.status).toBe(500)
  })
})
