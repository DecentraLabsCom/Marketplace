/**
 * Tests for GET /api/contract/lab/getAllLabs
 * Public GET, no auth. Fetches lab IDs from getLabsPaginated, does existence check via ownerOf.
 */
import { GET } from '../route'
import { getContractInstance } from '../../../utils/contractInstance'

jest.mock('../../../utils/contractInstance', () => ({ getContractInstance: jest.fn() }))
jest.mock('@/utils/blockchain/bigIntSerializer', () => ({
  createSerializedJsonResponse: jest.fn((data, init) => ({ status: init?.status ?? 200, json: async () => data })),
}))
jest.mock('@/utils/dev/logger', () => ({ log: jest.fn(), warn: jest.fn(), error: jest.fn() }))

if (!global.Response) {
  global.Response = class {
    static json(data, init) { return { status: init?.status ?? 200, json: async () => data } }
  }
}

describe('GET /api/contract/lab/getAllLabs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    getContractInstance.mockResolvedValue({
      getLabsPaginated: jest.fn().mockResolvedValue([[BigInt(1), BigInt(2)], BigInt(2)]),
      ownerOf: jest.fn().mockResolvedValue('0xOwner'),
    })
  })

  afterEach(() => { console.log.mockRestore(); console.error.mockRestore(); console.warn.mockRestore() })

  it('returns filtered list of lab IDs', async () => {
    const res = await GET()
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(Array.isArray(data)).toBe(true)
    expect(data).toContain(1)
    expect(data).toContain(2)
  })

  it('filters out labs where ownerOf throws a missing-lab error', async () => {
    const mockContract = {
      getLabsPaginated: jest.fn().mockResolvedValue([[BigInt(1), BigInt(2)], BigInt(2)]),
      ownerOf: jest.fn()
        .mockResolvedValueOnce('0xOwner') // lab 1 exists
        .mockRejectedValueOnce(Object.assign(new Error(), { message: 'lab does not exist' })), // lab 2 deleted
    }
    getContractInstance.mockResolvedValue(mockContract)
    const res = await GET()
    const data = await res.json()
    expect(data).toEqual([1])
    expect(data).not.toContain(2)
  })

  it('returns empty list when getLabsPaginated throws FunctionNotFound', async () => {
    getContractInstance.mockResolvedValue({
      getLabsPaginated: jest.fn().mockRejectedValue(Object.assign(new Error(), { code: 'CALL_EXCEPTION' })),
    })
    const res = await GET()
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(Array.isArray(data)).toBe(true)
    expect(data).toHaveLength(0)
  })

  it('returns 500 on unexpected error in non-production', async () => {
    const originalEnv = process.env.NODE_ENV
    const originalCI = process.env.CI
    process.env.NODE_ENV = 'development'
    process.env.CI = 'false'
    getContractInstance.mockRejectedValue(new Error('Some fatal error'))
    const res = await GET()
    expect(res.status).toBe(500)
    process.env.NODE_ENV = originalEnv
    if (originalCI === undefined) {
      delete process.env.CI
    } else {
      process.env.CI = originalCI
    }
  })
})
