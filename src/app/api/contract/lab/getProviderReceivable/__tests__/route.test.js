/**
 * @jest-environment node
 */
import { GET } from '../route'

jest.mock('../../../utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

jest.mock('@/utils/blockchain/bigIntSerializer', () => ({
  createSerializedJsonResponse: (data, options) => Response.json(data, options),
}))

const { getContractInstance } = require('../../../utils/contractInstance')

describe('GET /api/contract/lab/getProviderReceivable', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 400 when labId parameter is missing', async () => {
    const request = new Request('http://localhost/api/contract/lab/getProviderReceivable')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Missing labId parameter')
  })

  test('returns provider receivable data for valid lab ID', async () => {
    getContractInstance.mockResolvedValue({
      getLabProviderReceivable: jest.fn().mockResolvedValue({
        providerReceivable: BigInt('150000000'),
        deferredInstitutionalReceivable: BigInt('50000000'),
        totalReceivable: BigInt('200000000'),
        eligibleReservationCount: BigInt('3'),
      }),
    })

    const request = new Request('http://localhost/api/contract/lab/getProviderReceivable?labId=1')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.providerReceivable).toBe('150000000')
    expect(data.deferredInstitutionalReceivable).toBe('50000000')
    expect(data.totalReceivable).toBe('200000000')
    expect(data.eligibleReservationCount).toBe(3)
  })

  test('returns tuple-style provider receivable data', async () => {
    getContractInstance.mockResolvedValue({
      getLabProviderReceivable: jest.fn().mockResolvedValue([
        BigInt('100000000'),
        BigInt('0'),
        BigInt('100000000'),
        BigInt('2'),
      ]),
    })

    const request = new Request('http://localhost/api/contract/lab/getProviderReceivable?labId=5')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.providerReceivable).toBe('100000000')
    expect(data.totalReceivable).toBe('100000000')
    expect(data.eligibleReservationCount).toBe(2)
  })

  test('returns 500 on contract error', async () => {
    getContractInstance.mockResolvedValue({
      getLabProviderReceivable: jest.fn().mockRejectedValue(new Error('Contract reverted')),
    })

    const request = new Request('http://localhost/api/contract/lab/getProviderReceivable?labId=1')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toContain('Failed to fetch provider receivable')
  })
})
