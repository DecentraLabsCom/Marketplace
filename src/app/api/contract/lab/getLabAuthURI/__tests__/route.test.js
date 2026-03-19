/**
 * Tests for GET /api/contract/lab/getLabAuthURI
 * Simple public GET, uses NextResponse.json, requires labId.
 */
import { GET } from '../route'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'

jest.mock('next/server', () => ({
  NextResponse: { json: jest.fn((data, init) => ({ status: init?.status ?? 200, body: data })) }
}))
jest.mock('@/app/api/contract/utils/contractInstance', () => ({ getContractInstance: jest.fn() }))
jest.mock('@/utils/dev/logger', () => ({ error: jest.fn(), warn: jest.fn() }))

describe('GET /api/contract/lab/getLabAuthURI', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getContractInstance.mockResolvedValue({
      getLabAuthURI: jest.fn().mockResolvedValue('https://lab.example.com/auth'),
    })
  })

  function makeRequest(params = {}) {
    return { url: `http://localhost/?${new URLSearchParams(params)}` }
  }

  it('returns 400 when labId is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing required parameter: labId/)
  })

  it('returns authURI on success', async () => {
    const res = await GET(makeRequest({ labId: '1' }))
    expect(res.status).toBe(200)
    expect(res.body.authURI).toBe('https://lab.example.com/auth')
  })

  it('returns 500 when contract call fails', async () => {
    getContractInstance.mockResolvedValue({
      getLabAuthURI: jest.fn().mockRejectedValue(new Error('Contract error')),
    })
    const res = await GET(makeRequest({ labId: '1' }))
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/Contract error/)
  })
})
