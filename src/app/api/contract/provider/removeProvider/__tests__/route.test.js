/**
 * Tests for POST /api/contract/provider/removeProvider
 * Auth-gated, admin role required, accepts { wallet }, returns success message.
 */
import { POST } from '../route'
import { getContractInstance } from '../../../utils/contractInstance'
import { requireAuth, handleGuardError, ForbiddenError } from '@/utils/auth/guards'
import { hasAdminRole } from '@/utils/auth/roleValidation'

jest.mock('../../../utils/contractInstance', () => ({ getContractInstance: jest.fn() }))
jest.mock('@/utils/auth/guards', () => {
  class ForbiddenError extends Error { constructor(msg) { super(msg); this.name = 'ForbiddenError'; this.statusCode = 403 } }
  return {
    ForbiddenError,
    requireAuth: jest.fn(),
    handleGuardError: jest.fn((err) => ({ status: err.statusCode || 401, body: { error: err.message } })),
  }
})
jest.mock('@/utils/auth/roleValidation', () => ({ hasAdminRole: jest.fn() }))

if (!global.Response) {
  global.Response = class {
    static json(data, init) { return { status: init?.status ?? 200, json: async () => data } }
  }
}

function makeRequest(body) {
  return { json: async () => body }
}

describe('POST /api/contract/provider/removeProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    requireAuth.mockResolvedValue({ role: 'admin', scopedRole: 'none' })
    hasAdminRole.mockReturnValue(true)
    getContractInstance.mockResolvedValue({
      removeProvider: jest.fn().mockResolvedValue({ wait: jest.fn().mockResolvedValue(true) }),
    })
  })

  afterEach(() => { console.error.mockRestore() })

  it('throws ForbiddenError when user does not have admin role', async () => {
    hasAdminRole.mockReturnValue(false)
    await POST(makeRequest({ wallet: '0x1' }))
    expect(handleGuardError).toHaveBeenCalledWith(expect.objectContaining({ name: 'ForbiddenError' }))
  })

  it('returns 400 when wallet is missing', async () => {
    const res = await POST(makeRequest({}))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toMatch(/Missing required fields/)
  })

  it('returns success when contract call succeeds', async () => {
    const res = await POST(makeRequest({ wallet: '0x123' }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.message).toMatch(/Provider removed successfully/)
    expect(data.walletAddress).toBe('0x123')
  })

  it('returns 500 when contract call fails', async () => {
    getContractInstance.mockResolvedValue({
      removeProvider: jest.fn().mockRejectedValue(new Error('RPC Error')),
    })
    const res = await POST(makeRequest({ wallet: '0x123' }))
    expect(res.status).toBe(500)
  })
})
