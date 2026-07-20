/**
 * @jest-environment node
 */

jest.mock('@/utils/auth/guards', () => {
  class MockHttpError extends Error {
    constructor(status, message, code = 'FORBIDDEN') {
      super(message)
      this.status = status
      this.code = code
    }
  }
  class MockBadRequestError extends MockHttpError {
    constructor(message) { super(400, message, 'BAD_REQUEST') }
  }
  class MockConflictError extends MockHttpError {
    constructor(message, code = 'CONFLICT') { super(409, message, code) }
  }
  class MockForbiddenError extends MockHttpError {
    constructor(message, code = 'FORBIDDEN') { super(403, message, code) }
  }
  return {
    requireAuth: jest.fn(),
    requireProviderRole: jest.fn(),
    HttpError: MockHttpError,
    BadRequestError: MockBadRequestError,
    ConflictError: MockConflictError,
    ForbiddenError: MockForbiddenError,
    handleGuardError: jest.fn((error) => new Response(JSON.stringify({ error: error.message, code: error.code }), {
      status: error.status,
      headers: { 'content-type': 'application/json' },
    })),
  }
})

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

jest.mock('@/utils/blockchain/labCreatorHash', () => ({
  readLabCreatorPucHash: jest.fn(),
}))

jest.mock('@/utils/auth/puc', () => ({
  getPucHashFromSession: jest.fn(),
}))

jest.mock('@/utils/storage/labRetention', () => ({
  cleanupLabStorage: jest.fn(),
  normalizeRetainedLabId: (value) => String(value),
}))

import { POST } from '../cleanupLabData/route'
import { requireAuth, requireProviderRole } from '@/utils/auth/guards'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { readLabCreatorPucHash } from '@/utils/blockchain/labCreatorHash'
import { getPucHashFromSession } from '@/utils/auth/puc'
import { cleanupLabStorage } from '@/utils/storage/labRetention'

const TX_HASH = `0x${'a'.repeat(64)}`

function request(body) {
  return new Request('http://localhost/api/provider/cleanupLabData', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/provider/cleanupLabData', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    requireAuth.mockResolvedValue({
      id: 'provider-1',
      role: 'provider',
      eduPersonPrincipalName: 'provider@example.edu',
    })
    requireProviderRole.mockImplementation((session) => session)
    getPucHashFromSession.mockReturnValue(`0x${'b'.repeat(64)}`)
    readLabCreatorPucHash.mockResolvedValue(`0x${'b'.repeat(64)}`)
    cleanupLabStorage.mockResolvedValue({ storage: 'local', removed: ['public/7'] })
    getContractInstance.mockResolvedValue({
      target: '0x' + '1'.repeat(40),
      getAddress: jest.fn().mockResolvedValue('0x' + '1'.repeat(40)),
      runner: {
        getTransactionReceipt: jest.fn().mockResolvedValue({
          status: 1,
          to: '0x' + '1'.repeat(40),
          from: '0x' + '2'.repeat(40),
          logs: [{ topics: [], data: '0x' }],
        }),
      },
      interface: {
        parseLog: jest.fn().mockReturnValue({ name: 'LabDeleted', args: [7n] }),
      },
    })
  })

  test('requires a confirmed LabDeleted receipt and cleans storage', async () => {
    const response = await POST(request({ labId: 7, txHash: TX_HASH, metadataUri: 'Lab-Provider-7.json' }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ labId: 7, txHash: TX_HASH })
    expect(readLabCreatorPucHash).toHaveBeenCalledWith(expect.anything(), '7')
    expect(cleanupLabStorage).toHaveBeenCalledWith({ labId: '7', metadataUri: 'Lab-Provider-7.json' })
  })

  test('does not clean storage when the receipt lacks the deletion event', async () => {
    const contract = await getContractInstance()
    contract.interface.parseLog.mockReturnValue({ name: 'LabUpdated', args: [7n] })

    const response = await POST(request({ labId: 7, txHash: TX_HASH }))

    expect(response.status).toBe(409)
    expect(cleanupLabStorage).not.toHaveBeenCalled()
  })
})
