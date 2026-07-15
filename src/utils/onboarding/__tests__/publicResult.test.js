import { toPublicOnboardingResult } from '../publicResult'

describe('toPublicOnboardingResult', () => {
  test('keeps callback credentials and upstream errors out of browser payloads', () => {
    const result = toPublicOnboardingResult({
      status: 'FAILED',
      success: false,
      sessionId: 'session-1',
      stableUserId: 'stable-user',
      credentialId: 'credential-secret',
      publicKey: 'cose-key',
      error: 'backend stack trace',
      timestamp: '2026-07-15T00:00:00.000Z',
    }, 'callback')

    expect(result).toEqual({
      source: 'callback',
      status: 'FAILED',
      success: false,
      sessionId: 'session-1',
      institutionId: null,
      timestamp: '2026-07-15T00:00:00.000Z',
      error: 'Onboarding could not be completed.',
    })
    expect(result).not.toHaveProperty('stableUserId')
    expect(result).not.toHaveProperty('credentialId')
    expect(result).not.toHaveProperty('publicKey')
  })
})
