/**
 * Tests for GET /api/contract/reservation/isTokenListed
 * Public GET, native Response. Complex error handling (404, 422, 503, 500).
 */
import { GET } from '../route'
import { getContractInstance } from '../../../utils/contractInstance'

jest.mock('../../../utils/contractInstance', () => ({ getContractInstance: jest.fn() }))
jest.mock('@/utils/dev/logger', () => {
  const m = { log: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { __esModule: true, default: m, devLog: m, log: m.log, warn: m.warn, error: m.error }
})

if (!global.Response) {
  global.Response = class {
    static json(data, init) { return { status: init?.status ?? 200, json: async () => data } }
  }
}

function makeRequest(params = {}) {
  return { url: `http://localhost/?${new URLSearchParams(params)}` }
}

describe('GET /api/contract/reservation/isTokenListed', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    getContractInstance.mockResolvedValue({
      isTokenListed: jest.fn().mockResolvedValue(true),
    })
  })

  it('returns 400 when labId is missing', async () => {
    const res = await GET(makeRequest())
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toMatch(/Missing required parameter/)
  })

  it('returns 400 when labId is negative', async () => {
    const res = await GET(makeRequest({ labId: '-1' }))
    expect(res.status).toBe(400)
  })

  it('returns boolean on success', async () => {
    const res = await GET(makeRequest({ labId: '1' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.isListed).toBe(true)
    expect(data.labId).toBe(1)
  })

  it('returns 404 on missing lab error', async () => {
    getContractInstance.mockResolvedValue({
      isTokenListed: jest.fn().mockRejectedValue(Object.assign(new Error(), { reason: 'lab does not exist' })),
    })
    const res = await GET(makeRequest({ labId: '1' }))
    const data = await res.json()
    expect(res.status).toBe(404)
    expect(data.type).toBe('NOT_FOUND')
  })

  it('returns 422 on contract revert logic error', async () => {
    getContractInstance.mockResolvedValue({
      isTokenListed: jest.fn().mockRejectedValue(new Error('execution reverted: SomeRevert')),
    })
    const res = await GET(makeRequest({ labId: '1' }))
    const data = await res.json()
    expect(res.status).toBe(422)
    expect(data.type).toBe('CONTRACT_ERROR')
  })

  it('returns 503 on network error', async () => {
    getContractInstance.mockResolvedValue({
      isTokenListed: jest.fn().mockRejectedValue(new Error('network connection dropped')),
    })
    const res = await GET(makeRequest({ labId: '1' }))
    const data = await res.json()
    expect(res.status).toBe(503)
    expect(data.type).toBe('NETWORK_ERROR')
  })

  it('returns 500 on generic internal error', async () => {
    getContractInstance.mockResolvedValue(null)
    const res = await GET(makeRequest({ labId: '1' }))
    expect(res.status).toBe(500)
  })
})
