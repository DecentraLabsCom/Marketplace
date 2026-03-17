/**
 * @jest-environment node
 */

import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { readLabCreatorPucHash } from '@/utils/blockchain/labCreatorHash'

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

jest.mock('@/utils/blockchain/labCreatorHash', () => ({
  readLabCreatorPucHash: jest.fn(),
}))

describe('/api/contract/lab/getCreatorPucHash route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('returns 400 when labId is missing', async () => {
    const { GET } = await import('../api/contract/lab/getCreatorPucHash/route.js')

    const req = new Request('http://localhost/api/contract/lab/getCreatorPucHash')
    const res = await GET(req)

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'Missing labId parameter',
    })
  })

  test('returns 400 when labId is invalid', async () => {
    const { GET } = await import('../api/contract/lab/getCreatorPucHash/route.js')

    const req = new Request('http://localhost/api/contract/lab/getCreatorPucHash?labId=abc')
    const res = await GET(req)

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({
      error: 'Invalid labId format - must be a positive number',
      providedLabId: 'abc',
    })
  })

  test('returns creator hash for valid labId', async () => {
    const contract = { address: '0xcontract' }
    getContractInstance.mockResolvedValue(contract)
    readLabCreatorPucHash.mockResolvedValue('0x' + '1'.repeat(64))

    const { GET } = await import('../api/contract/lab/getCreatorPucHash/route.js')

    const req = new Request('http://localhost/api/contract/lab/getCreatorPucHash?labId=123')
    const res = await GET(req)

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      labId: 123,
      creatorPucHash: '0x' + '1'.repeat(64),
    })
    expect(getContractInstance).toHaveBeenCalled()
    expect(readLabCreatorPucHash).toHaveBeenCalledWith(contract, 123)
  })

  test('returns 500 when contract read fails', async () => {
    const contract = { address: '0xcontract' }
    getContractInstance.mockResolvedValue(contract)
    readLabCreatorPucHash.mockRejectedValue(new Error('rpc failed'))

    const { GET } = await import('../api/contract/lab/getCreatorPucHash/route.js')

    const req = new Request('http://localhost/api/contract/lab/getCreatorPucHash?labId=5')
    const res = await GET(req)

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({
      error: 'Failed to fetch creator hash for lab 5',
      labId: 5,
      details: undefined,
    })
  })
})
