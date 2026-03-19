/**
 * Tests for GET /api/contract/reservation/userOfReservation
 * Auth-gated, NextResponse. Requires reservationKey. Returns userAddress.
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

describe('GET /api/contract/reservation/userOfReservation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    requireAuth.mockResolvedValue({})
    getContractInstance.mockResolvedValue({
      userOfReservation: jest.fn().mockResolvedValue('0xUserAddress'),
    })
  })

  afterEach(() => { console.error.mockRestore() })

  it('handles auth errors', async () => {
    requireAuth.mockRejectedValue(new Error('Unauthorized'))
    await GET(makeRequest({}))
    expect(handleGuardError).toHaveBeenCalled()
  })

  it('returns 400 when reservationKey is missing', async () => {
    const res = await GET(makeRequest({}))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing required parameter: reservationKey/)
  })

  it('returns userAddress on success', async () => {
    const res = await GET(makeRequest({ reservationKey: '0xKey' }))
    expect(res.status).toBe(200)
    expect(res.body.userAddress).toBe('0xUserAddress')
    expect(res.body.reservationKey).toBe('0xKey')
  })

  it('returns 500 on contract error', async () => {
    getContractInstance.mockResolvedValue({
      userOfReservation: jest.fn().mockRejectedValue(new Error('RPC Error')),
    })
    const res = await GET(makeRequest({ reservationKey: '0xKey' }))
    expect(res.status).toBe(500)
  })
})
