/**
 * @jest-environment node
 */
/**
 * Tests for getStakeInfo API route
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

describe('GET /api/contract/provider/getStakeInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 400 when provider parameter is missing', async () => {
    const request = new Request('http://localhost/api/contract/provider/getStakeInfo')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Missing provider parameter')
  })

  test('returns 400 for invalid address format', async () => {
    const request = new Request('http://localhost/api/contract/provider/getStakeInfo?provider=invalid')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid provider address format')
  })

  test('returns 400 for address without 0x prefix', async () => {
    const request = new Request('http://localhost/api/contract/provider/getStakeInfo?provider=1234567890abcdef1234567890abcdef12345678')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid provider address format')
  })

  test('returns stake info for valid provider address', async () => {
    const mockStakeInfo = {
      stakedAmount: BigInt('800000000'),
      slashedAmount: BigInt('0'),
      lastReservationTimestamp: BigInt('1700000000'),
      unlockTimestamp: BigInt('1700086400'),
      canUnstake: false,
    }

    getContractInstance.mockResolvedValue({
      getStakeInfo: jest.fn().mockResolvedValue(mockStakeInfo),
    })

    const address = '0x1234567890abcdef1234567890abcdef12345678'
    const request = new Request(`http://localhost/api/contract/provider/getStakeInfo?provider=${address}`)
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.stakedAmount).toBe('800000000')
    expect(data.slashedAmount).toBe('0')
    expect(data.lastReservationTimestamp).toBe(1700000000)
    expect(data.unlockTimestamp).toBe(1700086400)
    expect(data.canUnstake).toBe(false)
  })

  test('returns stake info with tuple-style return format', async () => {
    // Some contracts may return arrays instead of named fields
    const mockStakeInfo = [
      BigInt('500000000'), // stakedAmount
      BigInt('100000000'), // slashedAmount
      BigInt('1700000000'), // lastReservationTimestamp
      BigInt('0'),          // unlockTimestamp
      true,                  // canUnstake
    ]

    getContractInstance.mockResolvedValue({
      getStakeInfo: jest.fn().mockResolvedValue(mockStakeInfo),
    })

    const address = '0x1234567890abcdef1234567890abcdef12345678'
    const request = new Request(`http://localhost/api/contract/provider/getStakeInfo?provider=${address}`)
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.stakedAmount).toBe('500000000')
    expect(data.slashedAmount).toBe('100000000')
    expect(data.canUnstake).toBe(true)
  })

  test('returns 500 on contract error', async () => {
    getContractInstance.mockResolvedValue({
      getStakeInfo: jest.fn().mockRejectedValue(new Error('RPC error')),
    })

    const address = '0x1234567890abcdef1234567890abcdef12345678'
    const request = new Request(`http://localhost/api/contract/provider/getStakeInfo?provider=${address}`)
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Failed to fetch stake info')
  })
})
