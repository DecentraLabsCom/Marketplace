/**
 * Tests for GET /api/contract/erc20/decimals
 *
 * Pattern: Public GET, no auth, native Response.json, returns fallback default (6) on error.
 */
import { GET } from '../route'
import { getContractInstance } from '../../../utils/contractInstance'

jest.mock('../../../utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

// Polyfill native Response.json for jsdom
if (!global.Response) {
  global.Response = class {
    constructor(body, init) { this._body = body; this._init = init; }
    static json(data, init) { return { _data: data, status: init?.status ?? 200, json: async () => data } }
  }
}

describe('GET /api/contract/erc20/decimals', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    console.log.mockRestore()
    console.error.mockRestore()
    console.warn.mockRestore()
  })

  it('returns decimals from contract on success', async () => {
    getContractInstance.mockResolvedValue({ decimals: jest.fn().mockResolvedValue(BigInt(18)) })
    const res = await GET()
    const data = await res.json()
    expect(data.decimals).toBe(18)
    expect(res.status).toBe(200)
  })

  it('returns fallback decimals (6) with fallback:true when contract throws', async () => {
    getContractInstance.mockResolvedValue({ decimals: jest.fn().mockRejectedValue(new Error('RPC Error')) })
    const res = await GET()
    const data = await res.json()
    expect(data.decimals).toBe(6)
    expect(data.fallback).toBe(true)
    expect(res.status).toBe(200)
  })

  it('returns fallback when getContractInstance itself throws', async () => {
    getContractInstance.mockRejectedValue(new Error('Contract unavailable'))
    const res = await GET()
    const data = await res.json()
    expect(data.decimals).toBe(6)
    expect(data.fallback).toBe(true)
  })
})
