/**
 * @jest-environment node
 */

import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { readLabPucHash } from '@/utils/blockchain/labCreatorHash'

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

jest.mock('@/utils/blockchain/labCreatorHash', () => ({
  readLabPucHash: jest.fn(),
}))

describe('/api/contract/lab/getPucHash route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 400 when labId is missing', async () => {
    const { GET } = await import('../api/contract/lab/getPucHash/route.js')

    const req = new Request('http://localhost/api/contract/lab/getPucHash')
    const res = await GET(req)

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'Missing required parameter: labId',
    })
  })

  test('returns 400 when labId is invalid', async () => {
    const { GET } = await import('../api/contract/lab/getPucHash/route.js')

    const req = new Request('http://localhost/api/contract/lab/getPucHash?labId=abc')
    const res = await GET(req)

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'Invalid labId - must be a non-negative number',
    })
  })

  test('returns creator hash for valid labId', async () => {
    const contract = { address: '0xcontract' }
    getContractInstance.mockResolvedValue(contract)
    readLabPucHash.mockResolvedValue('0x' + '1'.repeat(64))

    const { GET } = await import('../api/contract/lab/getPucHash/route.js')

    const req = new Request('http://localhost/api/contract/lab/getPucHash?labId=123')
    const res = await GET(req)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      labId: 123,
      pucHash: '0x' + '1'.repeat(64),
    })
    expect(getContractInstance).toHaveBeenCalled()
    expect(readLabPucHash).toHaveBeenCalledWith(contract, 123)
  })

  test('returns 500 when contract read fails', async () => {
    const contract = { address: '0xcontract' }
    getContractInstance.mockResolvedValue(contract)
    readLabPucHash.mockRejectedValue(new Error('rpc failed'))

    const { GET } = await import('../api/contract/lab/getPucHash/route.js')

    const req = new Request('http://localhost/api/contract/lab/getPucHash?labId=5')
    const res = await GET(req)

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({
      error: 'Failed to call getPucHash',
      details: undefined,
    })
  })
})
