import { GET } from '../api/backend/intents/[requestId]/onchain/route'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body, init = {}) => ({
      status: init.status || 200,
      json: async () => body,
    }),
  },
}))

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
  },
}))

describe('GET /api/backend/intents/[requestId]/onchain', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns on-chain intent metadata', async () => {
    const requestId = `0x${'a'.repeat(64)}`
    getContractInstance.mockResolvedValueOnce({
      getIntent: jest.fn().mockResolvedValue({
        signer: `0x${'1'.repeat(40)}`,
        executor: `0x${'2'.repeat(40)}`,
        action: 8n,
        payloadHash: `0x${'3'.repeat(64)}`,
        nonce: 7n,
        requestedAt: 100n,
        expiresAt: 200n,
        state: 2n,
      }),
    })

    const response = await GET({}, { params: { requestId } })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(getContractInstance).toHaveBeenCalledWith('diamond', true)
    expect(payload).toEqual(expect.objectContaining({
      requestId,
      action: 8,
      nonce: '7',
      state: 2,
      stateName: 'EXECUTED',
    }))
  })

  test('rejects invalid requestId', async () => {
    const response = await GET({}, { params: { requestId: 'req-not-hex' } })
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Missing or invalid requestId')
    expect(getContractInstance).not.toHaveBeenCalled()
  })
})
