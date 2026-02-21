/**
 * @jest-environment node
 */
/**
 * Tests for getPendingLabPayout API route
 */
import { GET } from '../route'

// Mock the contract instance
jest.mock('../../../utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

jest.mock('@/utils/blockchain/bigIntSerializer', () => ({
  createSerializedJsonResponse: (data, options) => Response.json(data, options),
}))

const { getContractInstance } = require('../../../utils/contractInstance')

describe('GET /api/contract/lab/getPendingLabPayout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 400 when labId parameter is missing', async () => {
    const request = new Request('http://localhost/api/contract/lab/getPendingLabPayout')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Missing labId parameter')
  })

  test('returns 400 for invalid labId format', async () => {
    const request = new Request('http://localhost/api/contract/lab/getPendingLabPayout?labId=abc')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('Invalid labId format')
  })

  test('returns 400 for negative labId', async () => {
    const request = new Request('http://localhost/api/contract/lab/getPendingLabPayout?labId=-1')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('Invalid labId format')
  })

  test('returns payout data for valid lab ID', async () => {
    const mockPayout = {
      walletPayout: BigInt('150000000'),
      institutionalPayout: BigInt('50000000'),
      totalPayout: BigInt('200000000'),
      institutionalCollectorCount: BigInt('3'),
    }

    getContractInstance.mockResolvedValue({
      getPendingLabPayout: jest.fn().mockResolvedValue(mockPayout),
    })

    const request = new Request('http://localhost/api/contract/lab/getPendingLabPayout?labId=1')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.walletPayout).toBe('150000000')
    expect(data.institutionalPayout).toBe('50000000')
    expect(data.totalPayout).toBe('200000000')
    expect(data.institutionalCollectorCount).toBe(3)
  })

  test('returns payout data with tuple-style return format', async () => {
    const mockPayout = [
      BigInt('100000000'), // walletPayout
      BigInt('0'),          // institutionalPayout
      BigInt('100000000'), // totalPayout
      BigInt('0'),          // institutionalCollectorCount
    ]

    getContractInstance.mockResolvedValue({
      getPendingLabPayout: jest.fn().mockResolvedValue(mockPayout),
    })

    const request = new Request('http://localhost/api/contract/lab/getPendingLabPayout?labId=5')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.walletPayout).toBe('100000000')
    expect(data.totalPayout).toBe('100000000')
    expect(data.institutionalCollectorCount).toBe(0)
  })

  test('handles lab ID 0 correctly', async () => {
    const mockPayout = {
      walletPayout: BigInt('0'),
      institutionalPayout: BigInt('0'),
      totalPayout: BigInt('0'),
      institutionalCollectorCount: BigInt('0'),
    }

    getContractInstance.mockResolvedValue({
      getPendingLabPayout: jest.fn().mockResolvedValue(mockPayout),
    })

    const request = new Request('http://localhost/api/contract/lab/getPendingLabPayout?labId=0')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.totalPayout).toBe('0')
  })

  test('returns 500 on contract error', async () => {
    getContractInstance.mockResolvedValue({
      getPendingLabPayout: jest.fn().mockRejectedValue(new Error('Contract reverted')),
    })

    const request = new Request('http://localhost/api/contract/lab/getPendingLabPayout?labId=1')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Failed to fetch pending payout')
  })
})
