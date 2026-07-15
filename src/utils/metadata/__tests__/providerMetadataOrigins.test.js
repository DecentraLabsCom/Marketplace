/**
 * @jest-environment node
 */

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

jest.mock('@/utils/api/gatewayProxy', () => ({
  normalizeInstitutionalBackendBaseUrl: jest.fn((value) => {
    const parsed = new URL(value)
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`
  }),
}))

import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { resolveProviderMetadataOrigins } from '../providerMetadataOrigins'

describe('provider metadata origins', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('resolves backend origins registered for the lab owner provider', async () => {
    const contract = {
      ownerOf: jest.fn().mockResolvedValue('0x00000000000000000000000000000000000000a1'),
      isLabProvider: jest.fn().mockResolvedValue(true),
      getRegisteredSchacHomeOrganizations: jest.fn().mockResolvedValue(['example.edu']),
      getSchacHomeOrganizationBackend: jest.fn().mockResolvedValue('https://backend.example/auth'),
    }
    getContractInstance.mockResolvedValue(contract)

    await expect(resolveProviderMetadataOrigins({ labId: 7 })).resolves.toEqual([
      'https://backend.example',
    ])
    expect(contract.ownerOf).toHaveBeenCalledWith(7n)
    expect(contract.getRegisteredSchacHomeOrganizations).toHaveBeenCalledWith(
      '0x00000000000000000000000000000000000000a1',
    )
    expect(contract.getSchacHomeOrganizationBackend).toHaveBeenCalledWith('example.edu')
  })

  test('does not trust metadata origins for a non-provider owner', async () => {
    const contract = {
      ownerOf: jest.fn().mockResolvedValue('0x00000000000000000000000000000000000000a2'),
      isLabProvider: jest.fn().mockResolvedValue(false),
      getRegisteredSchacHomeOrganizations: jest.fn(),
      getSchacHomeOrganizationBackend: jest.fn(),
    }

    await expect(resolveProviderMetadataOrigins({ labId: 8, contract })).resolves.toEqual([])
    expect(contract.getRegisteredSchacHomeOrganizations).not.toHaveBeenCalled()
  })

  test('rejects an invalid lab id before querying the chain', async () => {
    await expect(resolveProviderMetadataOrigins({ labId: 'not-a-number' })).rejects.toThrow(
      /Invalid labId/
    )
    expect(getContractInstance).not.toHaveBeenCalled()
  })
})
