/**
 * Tests for GET /api/contract/reservation/getReservationOfTokenByIndex
 * Auth-gated, NextResponse. Requires labId, index numbers.
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
jest.mock('@/utils/dev/logger', () => ({ devLog: { log: jest.fn(), error: jest.fn() } }))

function makeRequest(params = {}) {
  return { url: `http://localhost/?${new URLSearchParams(params)}` }
}

describe('GET /api/contract/reservation/getReservationOfTokenByIndex', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    requireAuth.mockResolvedValue({})
    getContractInstance.mockResolvedValue({
      getReservationOfTokenByIndex: jest.fn().mockResolvedValue(BigInt(123456789)),
    })
  })

  it('handles auth errors', async () => {
    requireAuth.mockRejectedValue(new Error('Unauthorized'))
    await GET(makeRequest())
    expect(handleGuardError).toHaveBeenCalled()
  })

  it('returns 400 when labId is missing', async () => {
    const res = await GET(makeRequest({ index: '0' }))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Lab ID is required/)
  })

  it('returns 400 when index is missing', async () => {
    const res = await GET(makeRequest({ labId: '1' }))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Index is required/)
  })

  it('returns 400 when parameters are negatively formatted', async () => {
    const res = await GET(makeRequest({ labId: '-1', index: '0' }))
    expect(res.status).toBe(400)
    const res2 = await GET(makeRequest({ labId: '1', index: '-5' }))
    expect(res2.status).toBe(400)
  })

  it('returns reservationKey string on success', async () => {
    const res = await GET(makeRequest({ labId: '1', index: '0' }))
    expect(res.status).toBe(200)
    expect(res.body.reservationKey).toBe('123456789')
    expect(res.body.labId).toBe(1)
    expect(res.body.index).toBe(0)
  })

  it('returns 500 on contract error', async () => {
    getContractInstance.mockResolvedValue({
      getReservationOfTokenByIndex: jest.fn().mockRejectedValue(new Error('Out of bounds')),
    })
    const res = await GET(makeRequest({ labId: '1', index: '0' }))
    expect(res.status).toBe(500)
  })
})
