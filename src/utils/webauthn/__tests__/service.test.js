import {
  getPucFromSession,
  getUserIdFromSession,
} from '@/utils/webauthn/service'

describe('WebAuthn service identity helpers', () => {
  it('derives the stable user id from the institutional session', () => {
    const session = {
      eduPersonPrincipalName: 'User@University.EDU',
    }

    expect(getUserIdFromSession(session)).toBe('user@university.edu')
    expect(getPucFromSession(session)).toBe('user@university.edu')
  })

  it('returns null when the session has no stable institutional identifier', () => {
    expect(getUserIdFromSession({})).toBeNull()
    expect(getPucFromSession(null)).toBeNull()
  })
})
