/**
 * Tests for GET /api/contract/reservation/getReservationsOfToken
 * Public GET, NextResponse. Requires labId. Returns count of reservations.
 */
import { GET } from '../route'
import { getContractInstance } from '../../../utils/contractInstance'

jest.mock('next/server', () => ({
  NextResponse: { json: jest.fn((data, init) => ({ status: init?.status ?? 200, body: data })) }
}))
jest.mock('../../../utils/contractInstance', () => ({ getContractInstance: jest.fn() }))
jest.mock('@/utils/dev/logger', () => ({ devLog: { log: jest.fn(), error: jest.fn() } }))

function makeRequest(params = {}) {
  return { url: `http://localhost/?${new URLSearchParams(params)}` }
}

describe('GET /api/contract/reservation/getReservationsOfToken', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getContractInstance.mockResolvedValue({
      getReservationsOfToken: jest.fn().mockResolvedValue(BigInt(5)),
    })
  })

  it('returns 400 when labId is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Lab ID is required/)
  })

  it('returns 400 when labId is negative', async () => {
    const res = await GET(makeRequest({ labId: '-1' }))
    expect(res.status).toBe(400)
  })

  it('returns count on success', async () => {
    const res = await GET(makeRequest({ labId: '1' }))
    expect(res.status).toBe(200)
    expect(res.body.count).toBe(5)
    expect(res.body.labId).toBe(1)
  })

  it('returns 500 on contract error', async () => {
    getContractInstance.mockResolvedValue({
      getReservationsOfToken: jest.fn().mockRejectedValue(new Error('RPC Error')),
    })
    const res = await GET(makeRequest({ labId: '1' }))
    expect(res.status).toBe(500)
  })
})
