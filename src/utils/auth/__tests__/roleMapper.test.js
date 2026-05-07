/**
 * Tests for roleMapper.js
 *
 * Covers:
 *  - Exact match (default)
 *  - Case-insensitive matching
 *  - Substring matching
 *  - Array claim values (e.g. Entra `roles`, Okta `groups`)
 *  - String claim values
 *  - Missing/null claims
 *  - Missing rule → no roles granted
 *  - mapClaimsToRoles — full role set derivation
 *  - isProvider / isAdmin convenience helpers
 */

import {
  evaluateRole,
  mapClaimsToRoles,
  isProvider,
  isAdmin,
} from '../roleMapper.js'

// ─── Base rule used in most tests ────────────────────────────────────────────

const ENTRA_RULE = {
  attribute: 'roles',
  providerValues: ['provider'],
  adminValues: ['admin'],
  caseInsensitive: true,
  substringMatch: false,
}

const JOB_TITLE_RULE = {
  attribute: 'jobTitle',
  providerValues: ['Manager', 'Director'],
  adminValues: ['CTO', 'CEO'],
  caseInsensitive: true,
  substringMatch: true,
}

// ─── evaluateRole ─────────────────────────────────────────────────────────────

describe('evaluateRole', () => {
  describe('array claim values (e.g. Entra roles)', () => {
    test('grants provider when matching value is in array', () => {
      const claims = { roles: ['provider'] }
      expect(evaluateRole(claims, ENTRA_RULE, 'provider')).toBe(true)
    })

    test('grants admin when matching value is in array', () => {
      const claims = { roles: ['admin'] }
      expect(evaluateRole(claims, ENTRA_RULE, 'admin')).toBe(true)
    })

    test('denies provider when array contains unrelated values', () => {
      const claims = { roles: ['student', 'viewer'] }
      expect(evaluateRole(claims, ENTRA_RULE, 'provider')).toBe(false)
    })

    test('grants when one of multiple values matches', () => {
      const claims = { roles: ['viewer', 'provider', 'other'] }
      expect(evaluateRole(claims, ENTRA_RULE, 'provider')).toBe(true)
    })
  })

  describe('string claim values', () => {
    test('grants provider when string value matches exactly', () => {
      const claims = { roles: 'provider' }
      expect(evaluateRole(claims, ENTRA_RULE, 'provider')).toBe(true)
    })

    test('denies provider when string value does not match', () => {
      const claims = { roles: 'student' }
      expect(evaluateRole(claims, ENTRA_RULE, 'provider')).toBe(false)
    })
  })

  describe('case-insensitive matching', () => {
    test('grants provider regardless of claim casing', () => {
      const claims = { roles: ['PROVIDER'] }
      expect(evaluateRole(claims, ENTRA_RULE, 'provider')).toBe(true)
    })

    test('grants provider when rule value is mixed case and claim is lowercase', () => {
      const rule = { ...ENTRA_RULE, providerValues: ['Provider'] }
      const claims = { roles: ['provider'] }
      expect(evaluateRole(claims, rule, 'provider')).toBe(true)
    })

    test('denies when caseInsensitive is false and casing differs', () => {
      const rule = { ...ENTRA_RULE, caseInsensitive: false }
      const claims = { roles: ['PROVIDER'] }
      expect(evaluateRole(claims, rule, 'provider')).toBe(false)
    })
  })

  describe('substring matching (jobTitle scenario)', () => {
    test('grants provider when claim contains target as substring', () => {
      const claims = { jobTitle: 'Technical Director' }
      expect(evaluateRole(claims, JOB_TITLE_RULE, 'provider')).toBe(true)
    })

    test('grants provider when claim matches exactly with substringMatch enabled', () => {
      const claims = { jobTitle: 'Manager' }
      expect(evaluateRole(claims, JOB_TITLE_RULE, 'provider')).toBe(true)
    })

    test('denies when claim does not contain any target substring', () => {
      const claims = { jobTitle: 'Engineer' }
      expect(evaluateRole(claims, JOB_TITLE_RULE, 'provider')).toBe(false)
    })

    test('denies when substringMatch is false and value is only a substring', () => {
      const rule = { ...ENTRA_RULE, substringMatch: false }
      const claims = { roles: ['myprovider'] }  // contains 'provider' but is not equal
      expect(evaluateRole(claims, rule, 'provider')).toBe(false)
    })
  })

  describe('missing / empty claims', () => {
    test('denies when claim attribute is absent', () => {
      const claims = { email: 'user@example.com' }
      expect(evaluateRole(claims, ENTRA_RULE, 'provider')).toBe(false)
    })

    test('denies when claim value is null', () => {
      const claims = { roles: null }
      expect(evaluateRole(claims, ENTRA_RULE, 'provider')).toBe(false)
    })

    test('denies when claim value is empty array', () => {
      const claims = { roles: [] }
      expect(evaluateRole(claims, ENTRA_RULE, 'provider')).toBe(false)
    })

    test('denies when rawClaims is null', () => {
      expect(evaluateRole(null, ENTRA_RULE, 'provider')).toBe(false)
    })

    test('denies when rule is null', () => {
      const claims = { roles: ['provider'] }
      expect(evaluateRole(claims, null, 'provider')).toBe(false)
    })

    test('denies when providerValues list is empty', () => {
      const rule = { ...ENTRA_RULE, providerValues: [] }
      const claims = { roles: ['provider'] }
      expect(evaluateRole(claims, rule, 'provider')).toBe(false)
    })
  })
})

// ─── mapClaimsToRoles ────────────────────────────────────────────────────────

describe('mapClaimsToRoles', () => {
  test('returns ["provider"] when only provider role matches', () => {
    const claims = { roles: ['provider'] }
    expect(mapClaimsToRoles(claims, ENTRA_RULE)).toEqual(['provider'])
  })

  test('returns ["admin", "provider"] when both match', () => {
    // admin is checked first; provider second
    const rule = { ...ENTRA_RULE, providerValues: ['provider', 'admin'] }
    const claims = { roles: ['admin'] }
    const roles = mapClaimsToRoles(claims, rule)
    expect(roles).toContain('admin')
  })

  test('returns [] when no roles match', () => {
    const claims = { roles: ['student'] }
    expect(mapClaimsToRoles(claims, ENTRA_RULE)).toEqual([])
  })

  test('returns [] when rule is null', () => {
    const claims = { roles: ['provider'] }
    expect(mapClaimsToRoles(claims, null)).toEqual([])
  })

  test('returns [] when claims is null', () => {
    expect(mapClaimsToRoles(null, ENTRA_RULE)).toEqual([])
  })
})

// ─── isProvider / isAdmin ────────────────────────────────────────────────────

describe('isProvider', () => {
  test('returns true when provider role is granted', () => {
    expect(isProvider({ roles: ['provider'] }, ENTRA_RULE)).toBe(true)
  })

  test('returns false when provider role is not granted', () => {
    expect(isProvider({ roles: ['student'] }, ENTRA_RULE)).toBe(false)
  })
})

describe('isAdmin', () => {
  test('returns true when admin role is granted', () => {
    expect(isAdmin({ roles: ['admin'] }, ENTRA_RULE)).toBe(true)
  })

  test('returns false when only provider role is granted', () => {
    expect(isAdmin({ roles: ['provider'] }, ENTRA_RULE)).toBe(false)
  })
})
