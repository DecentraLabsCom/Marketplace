/**
 * Tests for GET /api/contract/lab/tokenURI
 * Public GET, uses NextResponse.json, requires labId.
 */
import { GET } from '../route'
import { getContractInstance } from '../../../utils/contractInstance'

jest.mock('next/server', () => ({
  NextResponse: { json: jest.fn((data, init) => ({ status: init?.status ?? 200, body: data })) }
}))
jest.mock('../../../utils/contractInstance', () => ({ getContractInstance: jest.fn() }))

describe('GET /api/contract/lab/tokenURI', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    getContractInstance.mockResolvedValue({
      tokenURI: jest.fn().mockResolvedValue('https://ipfs.example.com/metadata/1.json'),
    })
  })

  afterEach(() => { console.error.mockRestore() })

  function makeRequest(params = {}) {
    return { url: `http://localhost/?${new URLSearchParams(params)}` }
  }

  it('returns 400 when labId is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/Missing required parameter: labId/)
  })

  it('returns tokenURI on success', async () => {
    const res = await GET(makeRequest({ labId: '1' }))
    expect(res.status).toBe(200)
    expect(res.body.tokenURI).toBe('https://ipfs.example.com/metadata/1.json')
    expect(res.body.labId).toBe('1')
  })

  it('returns 500 when contract call fails', async () => {
    getContractInstance.mockResolvedValue({
      tokenURI: jest.fn().mockRejectedValue(new Error('Token does not exist')),
    })
    const res = await GET(makeRequest({ labId: '999' }))
    expect(res.status).toBe(500)
  })
})
