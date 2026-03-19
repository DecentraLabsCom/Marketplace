/**
 * Tests for GET /api/contract/reservation/getSafeBalance
 * Auth-gated, NextResponse. Returns safe LAB token balance for the contract.
 */
import { GET } from '../route'
import { getContractInstance } from '../../../utils/contractInstance'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'

jest.mock('next/server', () => ({
  NextResponse: { json: jest.fn((data, init) => ({ status: init?.status ?? 200, body: data })) }
}))
jest.mock('../../../utils/contractInstance', () => ({ getContractInstance: jest.fn() }))
jest.mock('@/utils/auth/guards', () => ({
  requireAuth: jest.fn(),
  handleGuardError: jest.fn((err) => ({ status: 401, body: { error: err.message } })),
}))

describe('GET /api/contract/reservation/getSafeBalance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    requireAuth.mockResolvedValue({})
    getContractInstance.mockResolvedValue({
      getSafeBalance: jest.fn().mockResolvedValue(BigInt(10000)),
    })
  })

  afterEach(() => { console.error.mockRestore() })

  it('handles auth errors', async () => {
    requireAuth.mockRejectedValue(new Error('Unauthorized'))
    await GET()
    expect(handleGuardError).toHaveBeenCalled()
  })

  it('returns stringified balance on success', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.body.safeBalance).toBe('10000')
  })

  it('returns 500 on contract error', async () => {
    getContractInstance.mockResolvedValue({
      getSafeBalance: jest.fn().mockRejectedValue(new Error('Network error')),
    })
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
