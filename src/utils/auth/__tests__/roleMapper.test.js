import {
  evaluateRole,
  isAdmin,
  isProvider,
  mapClaimsToRoles,
} from '@/utils/auth/roleMapper'

describe('provider-neutral role mapper', () => {
  const rule = {
    attribute: 'application.roles',
    providerValues: ['Lab Provider'],
    adminValues: ['Platform Admin'],
  }

  test('maps scalar and array claims without exposing provider-specific names', () => {
    expect(mapClaimsToRoles({ application: { roles: ['lab provider'] } }, rule)).toEqual(['provider'])
    expect(mapClaimsToRoles({ application: { roles: ['Platform Admin', 'Lab Provider'] } }, rule))
      .toEqual(['admin', 'provider'])
  })

  test('supports strict case-sensitive and substring rules when explicitly configured', () => {
    expect(evaluateRole({ groups: ['DL-Platform-Admin'] }, {
      attribute: 'groups',
      adminValues: ['platform-admin'],
      caseInsensitive: false,
      substringMatch: true,
    }, 'admin')).toBe(false)
    expect(isAdmin({ groups: ['DL-Platform-Admin'] }, {
      attribute: 'groups',
      adminValues: ['Platform-Admin'],
      caseInsensitive: true,
      substringMatch: true,
    })).toBe(true)
  })

  test('does not grant a role for missing or non-string claims', () => {
    expect(isProvider({ roles: [{ name: 'provider' }] }, {
      attribute: 'roles',
      providerValues: ['provider'],
    })).toBe(false)
  })
})
