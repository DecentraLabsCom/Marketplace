/**
 * Tests for GET /api/contract/reservation/checkAvailable
 * Public GET, NextResponse, requires labId, start, end.
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

describe('GET /api/contract/reservation/checkAvailable', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    getContractInstance.mockResolvedValue({
      checkAvailable: jest.fn().mockResolvedValue(true),
    })
  })

  afterEach(() => { console.error.mockRestore() })

  it('returns 400 when parameters are missing', async () => {
    const res = await GET(makeRequest({ labId: '1', start: '123' }))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing required parameters/)
  })

  it('returns availability on success', async () => {
    const res = await GET(makeRequest({ labId: '1', start: '100', end: '200' }))
    expect(res.status).toBe(200)
    expect(res.body.isAvailable).toBe(true)
    expect(res.body.labId).toBe('1')
    expect(res.body.start).toBe('100')
    expect(res.body.end).toBe('200')
  })

  it('returns 500 on contract error', async () => {
    getContractInstance.mockResolvedValue({
      checkAvailable: jest.fn().mockRejectedValue(new Error('RPC Error')),
    })
    const res = await GET(makeRequest({ labId: '1', start: '100', end: '200' }))
    expect(res.status).toBe(500)
  })
})
