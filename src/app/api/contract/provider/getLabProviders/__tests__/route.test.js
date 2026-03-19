/**
 * Tests for GET /api/contract/provider/getLabProviders
 * Public GET, no auth, uses NextResponse, maps providers list.
 * Handles execution reverted errors specially.
 */
import { GET } from '../route'
import { getContractInstance } from '../../../utils/contractInstance'

jest.mock('next/server', () => ({
  NextResponse: { json: jest.fn((data, init) => ({ status: init?.status ?? 200, body: data })) }
}))
jest.mock('../../../utils/contractInstance', () => ({ getContractInstance: jest.fn() }))

const MOCK_PROVIDERS = [
  { account: '0xProvider1', base: { name: 'ProviderOne', email: 'p1@example.com', country: 'US', authURI: 'https://p1.com/auth' } },
  { account: '0xProvider2', base: { name: 'ProviderTwo', email: 'p2@example.com', country: 'DE', authURI: '' } },
]

describe('GET /api/contract/provider/getLabProviders', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
    getContractInstance.mockResolvedValue({
      getLabProviders: jest.fn().mockResolvedValue(MOCK_PROVIDERS),
    })
  })

  afterEach(() => { console.log.mockRestore(); console.error.mockRestore() })

  it('returns mapped providers list on success', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.body.providers).toHaveLength(2)
    expect(res.body.providers[0]).toEqual({
      account: '0xProvider1',
      name: 'ProviderOne',
      email: 'p1@example.com',
      country: 'US',
      authURI: 'https://p1.com/auth',
    })
    expect(res.body.count).toBe(2)
  })

  it('returns 400 when contract reverts', async () => {
    getContractInstance.mockResolvedValue({
      getLabProviders: jest.fn().mockRejectedValue(new Error('execution reverted: NotAllowed')),
    })
    const res = await GET()
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('CONTRACT_EXECUTION_ERROR')
  })

  it('returns 500 when contract is null', async () => {
    getContractInstance.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('CONNECTION_ERROR')
  })

  it('returns 500 on generic error', async () => {
    getContractInstance.mockRejectedValue(new Error('Network error'))
    const res = await GET()
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('INTERNAL_ERROR')
  })
})
