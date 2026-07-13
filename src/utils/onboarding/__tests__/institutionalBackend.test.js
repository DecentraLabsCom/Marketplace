import {
  resolveInstitutionalBackendUrl,
  hasInstitutionalBackend,
  clearBackendCache,
  validateInstitutionalBackendUrl,
} from '../institutionalBackend'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { lookup } from 'node:dns/promises'

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(),
}))

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  __esModule: true,
  getContractInstance: jest.fn(),
}))

jest.mock('@/utils/dev/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    moduleLoaded: jest.fn(),
  },
}))

describe('institutionalBackend', () => {
  const mockContract = {
    getSchacHomeOrganizationBackend: jest.fn(),
  }

  beforeEach(() => {
    clearBackendCache()
    getContractInstance.mockResolvedValue(mockContract)
    mockContract.getSchacHomeOrganizationBackend.mockReset()
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
  })

  test('returns null when institutionId is missing', async () => {
    await expect(resolveInstitutionalBackendUrl(null)).resolves.toBeNull()
    await expect(resolveInstitutionalBackendUrl('')).resolves.toBeNull()
  })

  test('resolves exact match and normalizes trailing slash', async () => {
    mockContract.getSchacHomeOrganizationBackend.mockResolvedValueOnce('https://backend.uned.es/')

    const resolved = await resolveInstitutionalBackendUrl('uned.es')
    expect(resolved).toBe('https://backend.uned.es')
    await expect(hasInstitutionalBackend('uned.es')).resolves.toBe(true)
  })

  test('resolves by base domain when subdomain provided', async () => {
    mockContract.getSchacHomeOrganizationBackend
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('https://backend.uned.es')

    const resolved = await resolveInstitutionalBackendUrl('mail.uned.es')
    expect(resolved).toBe('https://backend.uned.es')
  })

  test('returns null if contract lookup fails', async () => {
    mockContract.getSchacHomeOrganizationBackend.mockRejectedValueOnce(new Error('fail'))
    await expect(resolveInstitutionalBackendUrl('uned.es')).resolves.toBeNull()
  })

  test('uses cache after first resolution', async () => {
    mockContract.getSchacHomeOrganizationBackend.mockResolvedValueOnce('https://backend.uned.es')

    const first = await resolveInstitutionalBackendUrl('uned.es')
    mockContract.getSchacHomeOrganizationBackend.mockResolvedValueOnce('https://changed.example')
    const second = await resolveInstitutionalBackendUrl('uned.es')

    expect(first).toBe('https://backend.uned.es')
    expect(second).toBe('https://backend.uned.es')
    expect(mockContract.getSchacHomeOrganizationBackend).toHaveBeenCalledTimes(1)
  })

  test('rejects non-HTTPS backend URLs', async () => {
    await expect(validateInstitutionalBackendUrl('http://backend.uned.es'))
      .rejects.toThrow('HTTPS')
  })

  test('rejects literal private and link-local addresses', async () => {
    await expect(validateInstitutionalBackendUrl('https://127.0.0.1'))
      .rejects.toThrow('public')
    await expect(validateInstitutionalBackendUrl('https://169.254.169.254'))
      .rejects.toThrow('public')
  })

  test('rejects hostnames resolving to a private address', async () => {
    lookup.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }])

    await expect(validateInstitutionalBackendUrl('https://backend.uned.es'))
      .rejects.toThrow('public')
  })

  test('normalizes an HTTPS public backend base URL', async () => {
    await expect(validateInstitutionalBackendUrl('https://backend.uned.es/auth/'))
      .resolves.toBe('https://backend.uned.es/auth')
  })
})
