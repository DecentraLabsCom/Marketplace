/** @jest-environment node */

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}))

jest.mock('@/utils/auth/sessionCookie', () => ({
  getSessionFromCookies: jest.fn(),
}))

jest.mock('@/utils/onboarding', () => ({
  extractStableUserId: jest.fn(),
}))

jest.mock('@/utils/auth/institutionalServiceCredential', () => ({
  createInstitutionalServiceToken: jest.fn(),
}))

jest.mock('@/utils/auth/institutionDomain', () => ({
  resolveInstitutionDomainFromSession: jest.fn(),
}))

jest.mock('@/utils/auth/puc', () => ({
  getStableUserIdModeFromSession: jest.fn(),
}))

jest.mock('@/utils/onboarding/institutionalBackend', () => ({
  resolveInstitutionalBackendUrl: jest.fn(),
}))

import { cookies } from 'next/headers'
import { getSessionFromCookies } from '@/utils/auth/sessionCookie'
import { extractStableUserId } from '@/utils/onboarding'
import { resolveInstitutionDomainFromSession } from '@/utils/auth/institutionDomain'
import { getStableUserIdModeFromSession } from '@/utils/auth/puc'
import { resolveInstitutionalBackendUrl } from '@/utils/onboarding/institutionalBackend'
import { getOnboardingContext } from '../serverOnboarding'

describe('server onboarding context', () => {
  test('references the stored Keccak assertion hash without retaining the raw assertion', async () => {
    const assertionHash = `0x${'ab'.repeat(32)}`
    const session = {
      isSSO: true,
      email: 'user@uned.es',
      name: 'Test User',
      samlAssertionHash: assertionHash.toUpperCase(),
    }

    cookies.mockResolvedValue({})
    getSessionFromCookies.mockResolvedValue(session)
    extractStableUserId.mockReturnValue('stable-user-1')
    resolveInstitutionDomainFromSession.mockReturnValue('uned.es')
    getStableUserIdModeFromSession.mockReturnValue('principal')
    resolveInstitutionalBackendUrl.mockResolvedValue('https://backend.example.edu')

    const context = await getOnboardingContext()

    expect(context.payload.assertionReference).toBe(`keccak256:${assertionHash}`)
    expect(context.payload.samlAssertion).toBeUndefined()
  })
})
