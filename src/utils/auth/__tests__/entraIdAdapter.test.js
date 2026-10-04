import {
  buildCanonicalPrincipalFromEntra,
  resolveEntraInstitution,
} from '@/utils/auth/entraIdAdapter'
import { resetRegistry } from '@/utils/auth/idpRegistry'

describe('Entra ID identity adapter', () => {
  const originalEnvironment = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnvironment,
      ENTRA_ALLOWED_TENANTS: 'tenant-1',
      ENTRA_TENANT_INSTITUTIONS: JSON.stringify({ 'tenant-1': 'uned.es' }),
      ENTRA_PROVIDER_ROLE_VALUES: 'faculty,provider',
      ENTRA_ADMIN_ROLE_VALUES: 'platform-admin',
    }
    resetRegistry()
  })

  afterAll(() => {
    process.env = originalEnvironment
    resetRegistry()
  })

  test('maps a validated tenant to the configured institution', () => {
    expect(resolveEntraInstitution({ tid: 'tenant-1', email: 'user@other.example' })).toBe('uned.es')
  })

  test('creates a stable federated principal without using email as identity', () => {
    const principal = buildCanonicalPrincipalFromEntra({
      iss: 'https://login.microsoftonline.com/tenant-1/v2.0',
      tid: 'tenant-1',
      oid: 'oid-123',
      sub: 'subject-123',
      preferred_username: 'user@other.example',
      name: 'Ada Lovelace',
      roles: ['faculty'],
    })

    expect(principal).toMatchObject({
      authMethod: 'entra-id',
      externalIssuer: 'https://login.microsoftonline.com/tenant-1/v2.0',
      externalSubject: 'oid-123',
      institutionId: 'uned.es',
      email: 'user@other.example',
      roles: ['provider'],
    })
    expect(principal.sub).toBe('oidc:entra-id:tenant-1:oid-123')
  })

  test('maps configured Entra app roles to canonical roles', () => {
    const principal = buildCanonicalPrincipalFromEntra({
      iss: 'https://login.microsoftonline.com/tenant-1/v2.0',
      tid: 'tenant-1',
      oid: 'oid-123',
      sub: 'subject-123',
      roles: ['platform-admin'],
    })

    expect(principal.roles).toEqual(['admin'])
    expect(principal.role).toBeUndefined()
  })

  test('rejects tenants outside the configured allow-list', () => {
    expect(() => buildCanonicalPrincipalFromEntra({
      iss: 'https://login.microsoftonline.com/tenant-2/v2.0',
      tid: 'tenant-2',
      oid: 'oid-123',
      sub: 'subject-123',
    })).toThrow('tenant is not allowed')
  })
})
