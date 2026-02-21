import { sanitizeSessionUserForClient } from '@/utils/auth/publicSessionUser'

describe('publicSessionUser', () => {
  test('removes sensitive/internal fields from session payload', () => {
    const user = {
      id: 'user-1',
      email: 'user@example.com',
      name: 'User Name',
      authType: 'sso',
      affiliation: 'uned.es',
      personalUniqueCode: 'urn:mace:terena.org:schac:personalUniqueCode:es:abc',
      samlAssertion: 'BASE64_ASSERTION',
      samlAssertionCompressed: 'compressed',
      samlAssertionEncoding: 'deflate',
      internalToken: 'secret',
    }

    const sanitized = sanitizeSessionUserForClient(user)
    expect(sanitized).toEqual(
      expect.objectContaining({
        id: user.id,
        email: user.email,
        name: user.name,
        authType: user.authType,
        affiliation: user.affiliation,
        personalUniqueCode: user.personalUniqueCode,
      })
    )

    expect(sanitized.samlAssertion).toBeUndefined()
    expect(sanitized.samlAssertionCompressed).toBeUndefined()
    expect(sanitized.internalToken).toBeUndefined()
  })

  test('adds backwards-compatible aliases', () => {
    const sanitized = sanitizeSessionUserForClient({
      affiliation: 'uned.es',
      personalUniqueCode: 'puc-1',
    })

    expect(sanitized.schacHomeOrganization).toBe('uned.es')
    expect(sanitized.schacPersonalUniqueCode).toBe('puc-1')
  })
})
