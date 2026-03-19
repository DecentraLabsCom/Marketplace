/**
 * Tests for POST /api/contract/provider/updateProvider
 * Deprecated endpoint stub, returns 400 always.
 */
import { POST } from '../route'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'

jest.mock('@/utils/auth/guards', () => ({
  requireAuth: jest.fn(),
  handleGuardError: jest.fn((err) => ({ status: 401, body: { error: err.message } })),
}))
jest.mock('next/server', () => ({
  NextResponse: { json: jest.fn((data, init) => ({ status: init?.status ?? 200, json: async () => data })) }
}))

if (!global.Response) {
  global.Response = class {
    static json(data, init) { return { status: init?.status ?? 200, json: async () => data } }
  }
}

describe('POST /api/contract/provider/updateProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    requireAuth.mockResolvedValue({})
  })

  afterEach(() => { console.log.mockRestore() })

  it('returns 400 with deprecation message', async () => {
    const res = await POST({ json: async () => ({ name: 'A', email: 'b', country: 'c', userAddress: '0x0' }) })
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).toMatch(/Update must be executed with wallet signature/)
  })

  it('handles auth errors', async () => {
    const authError = new Error('Unauthorized');
    authError.name = 'UnauthorizedError';
    requireAuth.mockRejectedValue(authError)
    await POST()
    expect(handleGuardError).toHaveBeenCalled()
  })
})
