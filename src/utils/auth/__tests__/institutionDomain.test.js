import {
  resolveInstitutionDomain,
  resolveInstitutionDomainFromSession,
} from '@/utils/auth/institutionDomain'

describe('institutionDomain', () => {
  test('resolveInstitutionDomain extracts domain from scoped values', () => {
    expect(resolveInstitutionDomain(['member@Example.EDU'])).toBe('example.edu')
  })

  test('resolveInstitutionDomainFromSession resolves from schacHomeOrganization', () => {
    const session = {
      schacHomeOrganization: 'University.EDU',
    }

    expect(resolveInstitutionDomainFromSession(session)).toBe('university.edu')
  })

  test('resolveInstitutionDomainFromSession resolves from eduPersonScopedAffiliation', () => {
    const session = {
      eduPersonScopedAffiliation: 'staff@campus.edu',
    }

    expect(resolveInstitutionDomainFromSession(session)).toBe('campus.edu')
  })
})
