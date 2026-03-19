/**
 * Tests for GET /api/contract/lab/getLabReputation
 * Public GET, labId param, uses createSerializedJsonResponse.
 * Transforms contract reputation object: score, totalEvents, ownerCancellations, etc.
 */
import { GET } from '../route'
import { getContractInstance } from '../../../utils/contractInstance'

jest.mock('../../../utils/contractInstance', () => ({ getContractInstance: jest.fn() }))
jest.mock('@/utils/blockchain/bigIntSerializer', () => ({
  createSerializedJsonResponse: jest.fn((data, init) => ({ status: init?.status ?? 200, json: async () => data })),
}))

if (!global.Response) {
  global.Response = class {
    static json(data, init) { return { status: init?.status ?? 200, json: async () => data } }
  }
}

function makeRequest(params = {}) {
  return { url: `http://localhost/?${new URLSearchParams(params)}` }
}

describe('GET /api/contract/lab/getLabReputation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    getContractInstance.mockResolvedValue({
      getLabReputation: jest.fn().mockResolvedValue({
        score: BigInt(85),
        totalEvents: BigInt(20),
        ownerCancellations: BigInt(1),
        institutionalCancellations: BigInt(2),
        lastUpdated: BigInt(1700000000),
      }),
    })
  })

  afterEach(() => { console.log.mockRestore(); console.error.mockRestore() })

  it('returns 400 when labId is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(400)
  })

  it('returns transformed reputation data on success', async () => {
    const res = await GET(makeRequest({ labId: '1' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.score).toBe(85)
    expect(data.totalEvents).toBe(20)
    expect(data.ownerCancellations).toBe(1)
    expect(data.institutionalCancellations).toBe(2)
    expect(data.lastUpdated).toBe(1700000000)
  })

  it('returns 500 on contract error', async () => {
    getContractInstance.mockResolvedValue({
      getLabReputation: jest.fn().mockRejectedValue(new Error('RPC Error')),
    })
    const res = await GET(makeRequest({ labId: '1' }))
    expect(res.status).toBe(500)
  })
})
