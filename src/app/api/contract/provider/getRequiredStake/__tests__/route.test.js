/**
 * @jest-environment node
 */
/**
 * Tests for getRequiredStake API route
 */
import { GET } from '../route'

jest.mock('../../../utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

jest.mock('@/utils/blockchain/bigIntSerializer', () => ({
  createSerializedJsonResponse: (data, options) => Response.json(data, options),
}))

const { getContractInstance } = require('../../../utils/contractInstance')

describe('GET /api/contract/provider/getRequiredStake', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 400 when provider parameter is missing', async () => {
    const request = new Request('http://localhost/api/contract/provider/getRequiredStake')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Missing provider parameter')
  })

  test('returns 400 for invalid address format', async () => {
    const request = new Request('http://localhost/api/contract/provider/getRequiredStake?provider=invalid')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid provider address format')
  })

  test('returns required stake for valid provider address', async () => {
    getContractInstance.mockResolvedValue({
      getRequiredStake: jest.fn().mockResolvedValue(BigInt('800000000')),
    })

    const provider = '0x1234567890abcdef1234567890abcdef12345678'
    const request = new Request(`http://localhost/api/contract/provider/getRequiredStake?provider=${provider}`)
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.requiredStake).toBe('800000000')
    expect(data.provider).toBe(provider.toLowerCase())
  })

  test('returns 500 on contract error', async () => {
    getContractInstance.mockResolvedValue({
      getRequiredStake: jest.fn().mockRejectedValue(new Error('RPC error')),
    })

    const provider = '0x1234567890abcdef1234567890abcdef12345678'
    const request = new Request(`http://localhost/api/contract/provider/getRequiredStake?provider=${provider}`)
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Failed to fetch required stake')
  })
})
