/**
 * Tests for GET /api/contract/reservation/getReservationsOfTokenByUser
 * Public GET, NextResponse. labId, userAddress req. Paginated (offset, limit).
 */
import { GET } from '../route'
import { getContractInstance } from '../../../utils/contractInstance'

jest.mock('next/server', () => ({
  NextResponse: { json: jest.fn((data, init) => ({ status: init?.status ?? 200, body: data })) }
}))
jest.mock('../../../utils/contractInstance', () => ({ getContractInstance: jest.fn() }))

function makeRequest(params = {}) {
  return { url: `http://localhost/?${new URLSearchParams(params)}` }
}

describe('GET /api/contract/reservation/getReservationsOfTokenByUser', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    getContractInstance.mockResolvedValue({
      getReservationsOfTokenByUserPaginated: jest.fn().mockResolvedValue([
        [BigInt('0x123'), BigInt('0x456')],
        BigInt(2)
      ]),
    })
  })

  afterEach(() => { console.error.mockRestore() })

  it('returns 400 when labId or userAddress is missing', async () => {
    let res = await GET(makeRequest({ userAddress: '0x1' }))
    expect(res.status).toBe(400)
    
    res = await GET(makeRequest({ labId: '1' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 on invalid parameters', async () => {
    let res = await GET(makeRequest({ labId: '-1', userAddress: '0x1' }))
    expect(res.status).toBe(400)
    
    res = await GET(makeRequest({ labId: '1', userAddress: '0x1', limit: '200' }))
    expect(res.status).toBe(400)
  })

  it('returns serialized keys and total count on success', async () => {
    const res = await GET(makeRequest({ labId: '1', userAddress: '0x1', offset: '0', limit: '10' }))
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(2)
    expect(res.body.keys).toHaveLength(2)
    expect(res.body.keys[0]).toEqual('291') // 0x123
  })

  it('returns 500 on contract error', async () => {
    getContractInstance.mockResolvedValue({
      getReservationsOfTokenByUserPaginated: jest.fn().mockRejectedValue(new Error('RPC')),
    })
    const res = await GET(makeRequest({ labId: '1', userAddress: '0x1' }))
    expect(res.status).toBe(500)
  })
})
