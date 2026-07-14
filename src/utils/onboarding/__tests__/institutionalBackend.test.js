/**
 * @jest-environment node
 */

import {
  resolveInstitutionalBackendUrl,
  hasInstitutionalBackend,
  clearBackendCache,
  INSTITUTIONAL_BACKEND_CACHE_TTL_MS,
} from '../institutionalBackend'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'

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
  })

  afterEach(() => {
    jest.useRealTimers()
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

  test('does not guess a registrable parent domain from the last two labels', async () => {
    mockContract.getSchacHomeOrganizationBackend
      .mockResolvedValue('')

    const resolved = await resolveInstitutionalBackendUrl('dept.university.ac.uk')
    expect(resolved).toBeNull()
    expect(mockContract.getSchacHomeOrganizationBackend).toHaveBeenCalledTimes(1)
    expect(mockContract.getSchacHomeOrganizationBackend).toHaveBeenCalledWith('dept.university.ac.uk')
    expect(mockContract.getSchacHomeOrganizationBackend).not.toHaveBeenCalledWith('ac.uk')
  })

  test('returns null if contract lookup fails', async () => {
    mockContract.getSchacHomeOrganizationBackend.mockRejectedValueOnce(new Error('fail'))
    await expect(resolveInstitutionalBackendUrl('uned.es')).resolves.toBeNull()
  })

  test('uses cache until the TTL and observes an on-chain backend change afterwards', async () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    mockContract.getSchacHomeOrganizationBackend.mockResolvedValueOnce('https://backend.uned.es')

    const first = await resolveInstitutionalBackendUrl('uned.es')
    mockContract.getSchacHomeOrganizationBackend.mockResolvedValueOnce('https://changed.example')
    const second = await resolveInstitutionalBackendUrl('uned.es')
    jest.advanceTimersByTime(INSTITUTIONAL_BACKEND_CACHE_TTL_MS + 1)
    const refreshed = await resolveInstitutionalBackendUrl('uned.es')

    expect(first).toBe('https://backend.uned.es')
    expect(second).toBe('https://backend.uned.es')
    expect(refreshed).toBe('https://changed.example')
    expect(mockContract.getSchacHomeOrganizationBackend).toHaveBeenCalledTimes(2)
  })
})
