/**
 * Tests for lab contract routes using native Response.json and labId param:
 *   - GET /api/contract/lab/getLab
 *   - GET /api/contract/lab/getAllLabs
 *   - GET /api/contract/lab/getLabAuthURI
 *   - GET /api/contract/lab/balanceOf
 *   - GET /api/contract/lab/ownerOf
 *   - GET /api/contract/lab/tokenURI
 *   - GET /api/contract/lab/getLabReputation
 *   - GET /api/contract/lab/getPendingLabPayout
 *   - GET /api/contract/lab/tokenOfOwnerByIndex
 */

// ────────────────────────────────────────────────────────────────────────────────
// GET /api/contract/lab/getLab
// ────────────────────────────────────────────────────────────────────────────────

if (!global.Response) {
  global.Response = class {
    static json(data, init) { return { status: init?.status ?? 200, json: async () => data } }
  }
}

describe('GET /api/contract/lab/getLab', () => {
  let GET, getContractInstance, createSerializedJsonResponse

  beforeAll(() => {
    jest.resetModules()
    jest.mock('../../../utils/contractInstance', () => ({ getContractInstance: jest.fn() }))
    jest.mock('@/utils/blockchain/bigIntSerializer', () => ({
      createSerializedJsonResponse: jest.fn((data, init) => ({ status: init?.status ?? 200, json: async () => data })),
    }))
  })

  beforeEach(async () => {
    ;({ GET } = await import('../route'))
    ;({ getContractInstance } = await import('../../../utils/contractInstance'))
    ;({ createSerializedJsonResponse } = await import('@/utils/blockchain/bigIntSerializer'))
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    getContractInstance.mockResolvedValue({
      getLab: jest.fn().mockResolvedValue([BigInt(1), ['http://uri', BigInt(100), '', '', BigInt(1000000)]]),
    })
  })

  afterEach(() => { console.log.mockRestore(); console.error.mockRestore() })

  function makeRequest(params = {}) {
    return { url: `http://localhost/?${new URLSearchParams(params)}` }
  }

  it('returns 400 when labId is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(400)
  })

  it('returns 400 when labId is negative', async () => {
    const res = await GET(makeRequest({ labId: '-1' }))
    expect(res.status).toBe(400)
  })

  it('returns lab data on success with transformed structure', async () => {
    const res = await GET(makeRequest({ labId: '1' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.labId).toBe(1)
    expect(data.base.uri).toBe('http://uri')
    expect(data.base.price).toBe('100')
  })

  it('returns 404 when isMissingLabError matches', async () => {
    getContractInstance.mockResolvedValue({
      getLab: jest.fn().mockRejectedValue(Object.assign(new Error(), { message: 'lab does not exist' })),
    })
    const res = await GET(makeRequest({ labId: '999' }))
    const data = await res.json()
    expect(res.status).toBe(404)
    expect(data.type).toBe('NOT_FOUND')
  })

  it('returns 500 on generic contract error', async () => {
    getContractInstance.mockResolvedValue({
      getLab: jest.fn().mockRejectedValue(new Error('Generic RPC Error')),
    })
    const res = await GET(makeRequest({ labId: '1' }))
    expect(res.status).toBe(500)
  })
})
