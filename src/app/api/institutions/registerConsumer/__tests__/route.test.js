/**
 * Tests for POST /api/institutions/registerConsumer
 * Validates consumer provisioning token, grants institution role via Diamond contract.
 */
import { POST } from '../route'
import { headers } from 'next/headers'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { extractBearerToken, verifyProvisioningToken } from '@/utils/auth/provisioningToken'

jest.mock('@/utils/dev/logger', () => {
  const m = { log: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { __esModule: true, default: m, devLog: m, log: m.log, warn: m.warn, error: m.error }
})
jest.mock('next/server', () => ({
  NextResponse: { json: jest.fn((data, init) => ({ status: init?.status ?? 200, body: data })) }
}))
jest.mock('next/headers', () => ({ headers: jest.fn() }))
jest.mock('@/app/api/contract/utils/contractInstance', () => ({ getContractInstance: jest.fn() }))
jest.mock('@/utils/auth/marketplaceJwt', () => ({
  __esModule: true,
  default: { normalizeOrganizationDomain: jest.fn(d => d.toLowerCase()) }
}))
jest.mock('@/utils/auth/provisioningToken', () => ({
  extractBearerToken: jest.fn(),
  normalizeHttpsUrl: jest.fn(u => u),
  requireString: jest.fn(s => s),
  verifyProvisioningToken: jest.fn(),
}))

function makeRequest(body) {
  return { json: async () => body, nextUrl: { origin: 'https://marketplace.com' }, url: 'https://marketplace.com' }
}

describe('POST /api/institutions/registerConsumer', () => {
  let mockWriteContract
  let mockReadContract

  beforeEach(() => {
    jest.clearAllMocks()
    
    headers.mockResolvedValue({ get: jest.fn().mockReturnValue('Bearer jwt.consumer.token') })
    extractBearerToken.mockReturnValue('jwt.consumer.token')
    verifyProvisioningToken.mockResolvedValue({
      type: 'consumer',
      consumerOrganization: 'consumer.edu',
      aud: ['https://backend.consumer.edu']
    })

    mockReadContract = {
      resolveSchacHomeOrganization: jest.fn().mockResolvedValue('0x0000000000000000000000000000000000000000'), // Not registered
      getSchacHomeOrganizationBackend: jest.fn().mockRejectedValue(new Error('No backend'))
    }

    mockWriteContract = {
      grantInstitutionRole: jest.fn().mockResolvedValue({ wait: jest.fn().mockResolvedValue({ hash: '0xHashGrant' }) }),
      adminSetSchacHomeOrganizationBackend: jest.fn().mockResolvedValue({ wait: jest.fn().mockResolvedValue({ hash: '0xHashBackend' }) })
    }

    getContractInstance.mockImplementation((type, isRead) => isRead ? mockReadContract : mockWriteContract)
  })

  it('returns 401 if token verification fails', async () => {
    verifyProvisioningToken.mockRejectedValue(new Error('Invalid token'))
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(401)
  })

  it('returns 400 if token type is not consumer', async () => {
    verifyProvisioningToken.mockResolvedValue({ type: 'provider' })
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/is not valid for consumer registration/)
  })

  it('returns 400 for invalid wallet format', async () => {
    const res = await POST(makeRequest({ walletAddress: 'not-an-address' }))
    expect(res.status).toBe(400)
  })

  it('registers new consumer successfully', async () => {
    const res = await POST(makeRequest({ walletAddress: '0x1234567890abcdef1234567890abcdef12345678', backendUrl: 'https://backend.consumer.edu' }))
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.grantRoleTxHash).toBe('0xHashGrant')
    expect(res.body.backendTxHash).toBe('0xHashBackend')
    expect(mockWriteContract.grantInstitutionRole).toHaveBeenCalled()
    expect(mockWriteContract.adminSetSchacHomeOrganizationBackend).toHaveBeenCalled()
  })

  it('returns 200 with alreadyRegistered true if fully registered to same wallet', async () => {
    const wallet = '0x1234567890abcdef1234567890abcdef12345678'
    mockReadContract.resolveSchacHomeOrganization.mockResolvedValue(wallet)
    mockReadContract.getSchacHomeOrganizationBackend.mockResolvedValue('https://backend.consumer.edu')
    
    const res = await POST(makeRequest({ walletAddress: wallet, backendUrl: 'https://backend.consumer.edu' }))
    expect(res.status).toBe(200)
    expect(res.body.alreadyRegistered).toBe(true)
    expect(mockWriteContract.grantInstitutionRole).not.toHaveBeenCalled()
  })

  it('returns 409 if organization is registered to different wallet', async () => {
    const wallet = '0x1234567890abcdef1234567890abcdef12345678'
    mockReadContract.resolveSchacHomeOrganization.mockResolvedValue('0x9999999999999999999999999999999999999999') // Different wallet
    
    const res = await POST(makeRequest({ walletAddress: wallet }))
    expect(res.status).toBe(409)
  })
})
