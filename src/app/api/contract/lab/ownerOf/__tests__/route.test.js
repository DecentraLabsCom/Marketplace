/**
 * Tests for GET /api/contract/lab/ownerOf
 * Public GET, labId param required, returns owner address.
 */
import { GET } from '../route'
import { getContractInstance } from '../../../utils/contractInstance'

jest.mock('../../../utils/contractInstance', () => ({ getContractInstance: jest.fn() }))

if (!global.Response) {
  global.Response = class {
    static json(data, init) { return { status: init?.status ?? 200, json: async () => data } }
  }
}

function makeRequest(params = {}) {
  return { url: `http://localhost/?${new URLSearchParams(params)}` }
}

describe('GET /api/contract/lab/ownerOf', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    getContractInstance.mockResolvedValue({
      ownerOf: jest.fn().mockResolvedValue('0xOwnerAddress1234567890abcdef1234567890AB'),
    })
  })

  afterEach(() => { console.log.mockRestore(); console.error.mockRestore() })

  it('returns 400 when labId is missing', async () => {
    const res = await GET(makeRequest())
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toMatch(/Missing labId/)
  })

  it('returns 400 when labId is not numeric', async () => {
    const res = await GET(makeRequest({ labId: 'abc' }))
    expect(res.status).toBe(400)
  })

  it('returns owner address on success', async () => {
    const res = await GET(makeRequest({ labId: '1' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.owner).toBe('0xOwnerAddress1234567890abcdef1234567890AB')
    expect(data.labId).toBe(1)
  })

  it('returns 500 on contract error', async () => {
    getContractInstance.mockResolvedValue({
      ownerOf: jest.fn().mockRejectedValue(new Error('Not found')),
    })
    const res = await GET(makeRequest({ labId: '1' }))
    expect(res.status).toBe(500)
  })
})
