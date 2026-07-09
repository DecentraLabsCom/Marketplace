import {
  OnboardingErrorCode,
  OnboardingStatus,
  extractStableUserId,
} from '../institutionalOnboarding'

describe('institutionalOnboarding', () => {
  const originalEnv = process.env

  afterEach(() => {
    process.env = originalEnv
  })

  test('OnboardingStatus enum values', () => {
    expect(OnboardingStatus.PENDING).toBe('PENDING')
    expect(OnboardingStatus.SUCCESS).toBe('SUCCESS')
    expect(OnboardingStatus.FAILED).toBe('FAILED')
    expect(OnboardingStatus.EXPIRED).toBe('EXPIRED')
    expect(OnboardingStatus.COMPLETED).toBe('COMPLETED')
    expect(OnboardingStatus.IN_PROGRESS).toBe('IN_PROGRESS')
  })

  test('OnboardingErrorCode enum values', () => {
    expect(OnboardingErrorCode.NO_BACKEND).toBe('NO_BACKEND_CONFIGURED')
    expect(OnboardingErrorCode.MISSING_USER_DATA).toBe('MISSING_USER_DATA')
    expect(OnboardingErrorCode.BACKEND_UNREACHABLE).toBe('BACKEND_UNREACHABLE')
  })

  test('extractStableUserId follows R&S shared identifier semantics', () => {
    expect(extractStableUserId({ eduPersonPrincipalName: 'ep@uni.edu' })).toBe('ep@uni.edu')
    expect(extractStableUserId({ eduPersonPrincipalName: 'ep@uni.edu', eduPersonTargetedID: 't1' })).toBe('ep@uni.edu|t1')
    expect(extractStableUserId({ id: 'justid' })).toBeNull()
    expect(extractStableUserId({ email: 'a@uned.es' })).toBeNull()
    expect(extractStableUserId(null)).toBeNull()
  })

  test('extractStableUserId can use only eduPersonPrincipalName by env config', () => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SAML_STABLE_USER_ID_MODE: 'principal',
    }

    expect(
      extractStableUserId({
        eduPersonPrincipalName: 'ep@uni.edu',
        eduPersonTargetedID: 't1',
      })
    ).toBe('ep@uni.edu')
  })
})
