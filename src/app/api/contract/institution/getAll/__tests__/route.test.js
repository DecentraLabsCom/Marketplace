/**
 * Tests for GET /api/contract/institution/getAll
 *
 * Pattern: Auth-gated GET, pagination via offset/limit query params,
 * native Response.json, returns institutions list.
 */
import { GET } from '../route'
import { getContractInstance } from '../../../utils/contractInstance'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'

jest.mock('../../../utils/contractInstance', () => ({ getContractInstance: jest.fn() }))
jest.mock('@/utils/auth/guards', () => ({
  requireAuth: jest.fn(),
  handleGuardError: jest.fn((err) => ({ status: err.statusCode || 401, body: { error: err.message } }))
}))

if (!global.Response) {
  global.Response = class {
    static json(data, init) { return { status: init?.status ?? 200, json: async () => data } }
  }
}

function makeRequest(params = {}) {
  return { url: `http://localhost:3000/api/contract/institution/getAll?${new URLSearchParams(params)}` }
}

describe('GET /api/contract/institution/getAll', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    requireAuth.mockResolvedValue({})
    getContractInstance.mockResolvedValue({
      getInstitutionsPaginated: jest.fn().mockResolvedValue([
        ['0xInstitution1', '0xInstitution2'],
        BigInt(2),
      ]),
    })
  })

  afterEach(() => {
    console.log.mockRestore()
    console.error.mockRestore()
  })

  it('delegates to handleGuardError when requireAuth fails', async () => {
    const err = new Error('Unauthorized'); err.name = 'UnauthorizedError'; err.statusCode = 401
    requireAuth.mockRejectedValue(err)
    await GET(makeRequest())
    expect(handleGuardError).toHaveBeenCalledWith(err)
  })

  it('returns 400 when offset is invalid', async () => {
    const res = await GET(makeRequest({ offset: '-1' }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toMatch(/Invalid offset/)
  })

  it('returns 400 when limit is out of range', async () => {
    const res = await GET(makeRequest({ limit: '501' }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toMatch(/Invalid limit/)
  })

  it('returns institutions on success', async () => {
    const res = await GET(makeRequest({ offset: '0', limit: '100' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.institutions).toEqual(['0xInstitution1', '0xInstitution2'])
    expect(data.total).toBe(2)
    expect(data.offset).toBe(0)
    expect(data.limit).toBe(100)
  })

  it('returns 500 when contract call fails', async () => {
    getContractInstance.mockResolvedValue({
      getInstitutionsPaginated: jest.fn().mockRejectedValue(new Error('RPC Error')),
    })
    const res = await GET(makeRequest())
    const data = await res.json()
    expect(res.status).toBe(500)
    expect(data.error).toMatch(/Failed to fetch institutions/)
  })
})
