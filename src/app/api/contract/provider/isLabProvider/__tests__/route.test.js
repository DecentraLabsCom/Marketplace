/**
 * Tests for GET /api/contract/provider/isLabProvider
 * Public GET, wallet param validated via regex, returns { wallet, isLabProvider, checked: true }.
 */
import { GET } from '../route'
import { getContractInstance } from '../../../utils/contractInstance'

jest.mock('../../../utils/contractInstance', () => ({ getContractInstance: jest.fn() }))

if (!global.Response) {
  global.Response = class {
    static json(data, init) { return { status: init?.status ?? 200, json: async () => data } }
  }
}

const VALID_ADDR = '0x1234567890abcdef1234567890abcdef12345678'
function makeRequest(params = {}) {
  return { url: `http://localhost/?${new URLSearchParams(params)}` }
}

describe('GET /api/contract/provider/isLabProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    getContractInstance.mockResolvedValue({
      isLabProvider: jest.fn().mockResolvedValue(true),
    })
  })

  afterEach(() => { console.error.mockRestore() })

  it('returns 400 when wallet is missing', async () => {
    const res = await GET(makeRequest())
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toMatch(/Missing wallet/)
  })

  it('returns 400 when wallet address is invalid', async () => {
    const res = await GET(makeRequest({ wallet: 'invalid-address' }))
    const data = await res.json()
    expect(res.status).toBe(400)
  })

  it('returns isLabProvider on success', async () => {
    const res = await GET(makeRequest({ wallet: VALID_ADDR }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.wallet).toBe(VALID_ADDR.toLowerCase())
    expect(data.isLabProvider).toBe(true)
    expect(data.checked).toBe(true)
  })

  it('returns 500 on contract error', async () => {
    getContractInstance.mockResolvedValue({
      isLabProvider: jest.fn().mockRejectedValue(new Error('RPC Error')),
    })
    const res = await GET(makeRequest({ wallet: VALID_ADDR }))
    expect(res.status).toBe(500)
  })
})
