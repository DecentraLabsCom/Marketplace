/**
 * @jest-environment node
 */

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

jest.mock('@/utils/auth/guards', () => ({
  requireAuth: jest.fn(),
  handleGuardError: jest.fn((error) => Response.json(
    { error: error?.message || 'guard error', code: error?.code || 'GUARD_ERROR' },
    { status: error?.status || 500 },
  )),
}))

jest.mock('@/contracts/diamond', () => ({
  contractAddresses: { sepolia: '0x1111111111111111111111111111111111111111' },
  deploymentModel: 'internal-credit-ledger',
}))

import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { requireAuth } from '@/utils/auth/guards'
import { GET as getDecimals } from '../erc20/decimals/route'
import { GET as getInstitutionCreditBalance } from '../institution/getInstitutionCreditBalance/route'
import { GET as getInstitutionLimit } from '../institution/getUserLimit/route'
import { GET as getInstitutionRemainingAllowance } from '../institution/getUserRemainingAllowance/route'
import { GET as getInstitutionSpendingData } from '../institution/getUserSpendingData/route'
import { GET as getAllInstitutions } from '../institution/getAll/route'
import { GET as getLabBalance } from '../lab/balanceOf/route'
import { GET as getLab } from '../lab/getLab/route'
import { GET as getLabReputation } from '../lab/getLabReputation/route'
import { GET as getLabOwner } from '../lab/ownerOf/route'
import { GET as getOwnedLab } from '../lab/tokenOfOwnerByIndex/route'
import { GET as getTokenUri } from '../lab/tokenURI/route'
import { GET as isLabProvider } from '../provider/isLabProvider/route'
import { GET as checkAvailable } from '../reservation/checkAvailable/route'
import { GET as getLabCreditAddress } from '../reservation/getLabCreditAddress/route'
import { GET as getReservationByIndex } from '../reservation/getReservationOfTokenByIndex/route'
import { GET as getReservationsOfToken } from '../reservation/getReservationsOfToken/route'
import { GET as isTokenListed } from '../reservation/isTokenListed/route'
import { GET as getReservationUser } from '../reservation/userOfReservation/route'
import { createContractHandler } from '../utils/createContractHandler'

const ADDRESS = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const OTHER_ADDRESS = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const BYTES32 = `0x${'11'.repeat(32)}`

const request = (path) => new Request(`http://localhost${path}`)
const json = (response) => response.json()

describe('contract read adapters', () => {
  let contract

  beforeEach(() => {
    contract = {
      balanceOf: jest.fn(),
      checkAvailable: jest.fn(),
      getInstitutionalTreasuryBalance: jest.fn(),
      getInstitutionalUserLimit: jest.fn(),
      getInstitutionalUserRemainingAllowance: jest.fn(),
      getInstitutionalUserSpendingData: jest.fn(),
      getInstitutionsPaginated: jest.fn(),
      getLab: jest.fn(),
      getLabReputation: jest.fn(),
      ownerOf: jest.fn(),
      tokenOfOwnerByIndex: jest.fn(),
      tokenURI: jest.fn(),
      isLabProvider: jest.fn(),
      getReservationOfTokenByIndex: jest.fn(),
      getReservationsOfToken: jest.fn(),
      isTokenListed: jest.fn(),
      userOfReservation: jest.fn(),
    }
    getContractInstance.mockResolvedValue(contract)
    requireAuth.mockResolvedValue({ id: 'session-1' })
  })

  test('reads paginated institutions with defaults and serializes addresses', async () => {
    contract.getInstitutionsPaginated.mockResolvedValue([[ADDRESS, OTHER_ADDRESS], 2n])

    const response = await getAllInstitutions(request('/api/contract/institution/getAll'))

    expect(response.status).toBe(200)
    await expect(json(response)).resolves.toEqual({
      institutions: [ADDRESS, OTHER_ADDRESS],
      total: 2,
      offset: 0,
      limit: 100,
    })
    expect(contract.getInstitutionsPaginated).toHaveBeenCalledWith(0, 100)
    expect(requireAuth).toHaveBeenCalledTimes(1)
  })

  test('validates generic query parameters before touching the contract', async () => {
    const response = await getInstitutionCreditBalance(
      request('/api/contract/institution/getInstitutionCreditBalance?institutionAddress=invalid'),
    )

    expect(response.status).toBe(400)
    await expect(json(response)).resolves.toEqual({
      error: 'Invalid institutionAddress address format',
    })
    expect(getContractInstance).not.toHaveBeenCalled()
  })

  test('returns institution scalar reads as JSON-safe strings with context', async () => {
    contract.getInstitutionalTreasuryBalance.mockResolvedValue(123456789n)
    contract.getInstitutionalUserLimit.mockResolvedValue(5000n)
    contract.getInstitutionalUserRemainingAllowance.mockResolvedValue(4200n)
    contract.getInstitutionalUserSpendingData.mockResolvedValue({ amount: 17n, periodStart: 99n })

    const [balance, limit, allowance, spending] = await Promise.all([
      getInstitutionCreditBalance(request(`/api/contract/institution/getInstitutionCreditBalance?institutionAddress=${ADDRESS}`)),
      getInstitutionLimit(request(`/api/contract/institution/getUserLimit?institutionAddress=${ADDRESS}`)),
      getInstitutionRemainingAllowance(request(`/api/contract/institution/getUserRemainingAllowance?institutionAddress=${ADDRESS}&pucHash=${BYTES32}`)),
      getInstitutionSpendingData(request(`/api/contract/institution/getUserSpendingData?institutionAddress=${ADDRESS}&pucHash=${BYTES32}`)),
    ])

    await expect(json(balance)).resolves.toEqual({ balance: '123456789', institutionAddress: ADDRESS })
    await expect(json(limit)).resolves.toEqual({ limit: '5000', institutionAddress: ADDRESS })
    await expect(json(allowance)).resolves.toEqual({
      remainingAllowance: '4200',
      institutionAddress: ADDRESS,
      pucHash: BYTES32,
    })
    await expect(json(spending)).resolves.toEqual({
      spendingData: { amount: '17', periodStart: '99' },
      institutionAddress: ADDRESS,
      pucHash: BYTES32,
    })
    expect(contract.getInstitutionalTreasuryBalance).toHaveBeenCalledWith(ADDRESS)
    expect(contract.getInstitutionalUserRemainingAllowance).toHaveBeenCalledWith(ADDRESS, BYTES32)
  })

  test('converts lab balance, ownership and token reads to stable response shapes', async () => {
    contract.balanceOf.mockResolvedValue(3n)
    contract.getLab.mockResolvedValue([
      7n,
      ['ipfs://lab', 1500n, 'https://access.example', 'access-key', 123n, 2n],
    ])
    contract.getLabReputation.mockResolvedValue({
      score: 9n,
      totalEvents: 4n,
      ownerCancellations: 1n,
      lastUpdated: 777n,
    })
    contract.ownerOf.mockResolvedValue(ADDRESS)
    contract.tokenOfOwnerByIndex.mockResolvedValue(42n)
    contract.tokenURI.mockResolvedValue('ipfs://metadata/42')

    const [balance, lab, reputation, owner, owned, uri] = await Promise.all([
      getLabBalance(request(`/api/contract/lab/balanceOf?wallet=${ADDRESS}`)),
      getLab(request('/api/contract/lab/getLab?labId=7')),
      getLabReputation(request('/api/contract/lab/getLabReputation?labId=7')),
      getLabOwner(request('/api/contract/lab/ownerOf?labId=7')),
      getOwnedLab(request(`/api/contract/lab/tokenOfOwnerByIndex?wallet=${ADDRESS}&index=0`)),
      getTokenUri(request('/api/contract/lab/tokenURI?labId=42')),
    ])

    await expect(json(balance)).resolves.toEqual({ count: 3, wallet: ADDRESS })
    await expect(json(lab)).resolves.toEqual({
      labId: 7,
      base: {
        uri: 'ipfs://lab',
        price: '1500',
        accessURI: 'https://access.example',
        accessKey: 'access-key',
        createdAt: 123,
        resourceType: 2,
      },
    })
    await expect(json(reputation)).resolves.toEqual({
      score: 9,
      totalEvents: 4,
      ownerCancellations: 1,
      lastUpdated: 777,
    })
    await expect(json(owner)).resolves.toEqual({ labId: 7, owner: ADDRESS })
    await expect(json(owned)).resolves.toEqual({ labId: '42', index: 0, wallet: ADDRESS })
    await expect(json(uri)).resolves.toEqual({ labId: '42', tokenURI: 'ipfs://metadata/42' })
  })

  test('reads provider and reservation adapters with their parameter types', async () => {
    contract.isLabProvider.mockResolvedValue(true)
    contract.checkAvailable.mockResolvedValue(false)
    contract.getReservationOfTokenByIndex.mockResolvedValue(BYTES32)
    contract.getReservationsOfToken.mockResolvedValue(2n)
    contract.isTokenListed.mockResolvedValue(true)
    contract.userOfReservation.mockResolvedValue(OTHER_ADDRESS)

    const [provider, available, byIndex, reservations, listed, user] = await Promise.all([
      isLabProvider(request(`/api/contract/provider/isLabProvider?wallet=${ADDRESS}`)),
      checkAvailable(request('/api/contract/reservation/checkAvailable?labId=42&start=100&end=200')),
      getReservationByIndex(request('/api/contract/reservation/getReservationOfTokenByIndex?labId=42&index=1')),
      getReservationsOfToken(request('/api/contract/reservation/getReservationsOfToken?labId=42')),
      isTokenListed(request('/api/contract/reservation/isTokenListed?labId=42')),
      getReservationUser(request(`/api/contract/reservation/userOfReservation?reservationKey=${BYTES32}`)),
    ])

    await expect(json(provider)).resolves.toEqual({ wallet: ADDRESS, isLabProvider: true, checked: true })
    await expect(json(available)).resolves.toEqual({
      labId: '42',
      start: '100',
      end: '200',
      isAvailable: false,
    })
    await expect(json(byIndex)).resolves.toEqual({ reservationKey: BYTES32, labId: 42, index: 1 })
    await expect(json(reservations)).resolves.toEqual({ count: 2, labId: 42 })
    await expect(json(listed)).resolves.toMatchObject({ labId: 42, isListed: true })
    expect((await listed).headers.get('Cache-Control')).toBe('no-store, max-age=0')
    await expect(json(user)).resolves.toEqual({ reservationKey: BYTES32, userAddress: OTHER_ADDRESS })
  })

  test('maps missing labs to 404 for the lab and listing adapters', async () => {
    contract.getLab.mockRejectedValue({ reason: 'ERC721NonexistentToken' })
    contract.isTokenListed.mockRejectedValue({ message: 'token does not exist' })

    const labResponse = await getLab(request('/api/contract/lab/getLab?labId=999'))
    const listedResponse = await isTokenListed(request('/api/contract/reservation/isTokenListed?labId=999'))

    expect(labResponse.status).toBe(404)
    await expect(json(labResponse)).resolves.toEqual({ error: 'Lab does not exist', type: 'NOT_FOUND' })
    expect(listedResponse.status).toBe(404)
    await expect(json(listedResponse)).resolves.toEqual({ error: 'Lab not found', type: 'NOT_FOUND' })
    expect(listedResponse.headers.get('Cache-Control')).toBe('no-store, max-age=0')
  })

  test('returns the configured internal credit ledger address without a contract call', async () => {
    const response = await getLabCreditAddress()

    expect(response.status).toBe(200)
    await expect(json(response)).resolves.toEqual({
      labCreditAddress: '0x1111111111111111111111111111111111111111',
      ledgerAddress: '0x1111111111111111111111111111111111111111',
      ledgerType: 'internal-credit-ledger',
      externalToken: false,
    })
    expect(getContractInstance).not.toHaveBeenCalled()
  })

  test('returns the compile-time credit decimals without a contract call', async () => {
    const response = await getDecimals()

    expect(response.status).toBe(200)
    await expect(json(response)).resolves.toEqual({
      decimals: 7,
      ledgerType: 'internal-credit-ledger',
      fallback: false,
    })
  })
})

describe('createContractHandler validation and RPC boundary', () => {
  test('supports optional defaults and bytes32 validation', async () => {
    const contract = { read: jest.fn().mockResolvedValue(8n) }
    getContractInstance.mockResolvedValue(contract)
    const { GET } = createContractHandler({
      params: [
        { name: 'offset', type: 'number', optional: true, default: 0 },
        { name: 'hash', type: 'bytes32' },
      ],
      method: 'read',
      transform: (value, parsed) => ({ value: value.toString(), parsed }),
    })

    const response = await GET(request(`/test?hash=${BYTES32}`))

    expect(response.status).toBe(200)
    await expect(json(response)).resolves.toEqual({
      value: '8',
      parsed: { offset: 0, hash: BYTES32 },
    })
    expect(contract.read).toHaveBeenCalledWith(0, BYTES32)
  })

  test('returns 400 for missing, malformed and out-of-range parameters', async () => {
    const { GET } = createContractHandler({
      params: [{ name: 'limit', type: 'number', min: 1, max: 5 }],
      method: 'read',
    })

    const missing = await GET(request('/test'))
    const malformed = await GET(request('/test?limit=abc'))
    const outOfRange = await GET(request('/test?limit=6'))

    expect(missing.status).toBe(400)
    expect(malformed.status).toBe(400)
    expect(outOfRange.status).toBe(400)
    await expect(json(missing)).resolves.toEqual({ error: 'Missing required parameter: limit' })
    await expect(json(malformed)).resolves.toEqual({ error: 'Invalid limit - must be a non-negative number' })
    await expect(json(outOfRange)).resolves.toEqual({ error: 'Invalid limit - must be at most 5' })
  })

  test('turns contract failures into a generic public RPC error', async () => {
    getContractInstance.mockRejectedValue(new Error('provider leaked internal detail'))
    const { GET } = createContractHandler({ method: 'read' })

    const response = await GET(request('/test'))
    const body = await json(response)

    expect(response.status).toBe(500)
    expect(body).toEqual(expect.objectContaining({
      error: 'The requested blockchain operation could not be completed.',
      code: 'CONTRACT_CALL_FAILED',
    }))
    expect(body.error).not.toContain('provider leaked')
  })
})
