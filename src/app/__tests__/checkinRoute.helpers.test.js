/** @jest-environment node */
/**
 * Helper function unit tests for /api/auth/checkin/route.js
 *
 * Focused on normalizeOrganizationDomain and resolveInstitutionWallet logic.
 */

import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import {
  normalizeOrganizationDomain,
  resolveInstitutionWallet,
} from '../api/auth/checkin/route.js'

jest.mock('@/app/api/contract/utils/contractInstance', () => ({
  getContractInstance: jest.fn(),
}))

describe('checkin route helpers', () => {
  describe('normalizeOrganizationDomain', () => {
    test('lowercases and trims valid domains', () => {
      expect(normalizeOrganizationDomain('  Univ-EXAMPLE.ES  ')).toBe('univ-example.es')
    })

    test('rejects domains containing invalid characters', () => {
      expect(() => normalizeOrganizationDomain('bad!domain')).toThrow(
        'Invalid character in organization domain'
      )
    })

    test('rejects too short or too long domains', () => {
      expect(() => normalizeOrganizationDomain('ab')).toThrow(
        'Invalid organization domain length'
      )
      const long = 'a'.repeat(256)
      expect(() => normalizeOrganizationDomain(long)).toThrow(
        'Invalid organization domain length'
      )
    })

    test('throws when input is not a string', () => {
      expect(() => normalizeOrganizationDomain(undefined)).toThrow(
        'Organization domain is required'
      )
      expect(() => normalizeOrganizationDomain(null)).toThrow(
        'Organization domain is required'
      )
    })
  })

  describe('resolveInstitutionWallet', () => {
    beforeEach(() => {
      jest.clearAllMocks()
    })

    test('returns null when contract returns zero address', async () => {
      getContractInstance.mockResolvedValue({
        resolveSchacHomeOrganization: jest
          .fn()
          .mockResolvedValue('0x0000000000000000000000000000000000000000'),
      })
      const result = await resolveInstitutionWallet('example.edu')
      expect(result).toBeNull()
      expect(getContractInstance).toHaveBeenCalled()
    })

    test('returns lowercased wallet when available', async () => {
      getContractInstance.mockResolvedValue({
        resolveSchacHomeOrganization: jest
          .fn()
          .mockResolvedValue('0xAbCd000000000000000000000000000000000000'),
      })
      const result = await resolveInstitutionWallet('EXAMPLE.EDU')
      expect(result).toBe('0xabcd000000000000000000000000000000000000')
    })

    test('propagates errors from normalization', async () => {
      await expect(resolveInstitutionWallet('bad!domain')).rejects.toThrow(
        'Invalid character in organization domain'
      )
    })
  })
})
