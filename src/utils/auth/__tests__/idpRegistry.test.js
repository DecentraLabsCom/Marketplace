import {
  findIdPByProvider,
  getRoleMappingRules,
  resetRegistry,
} from '@/utils/auth/idpRegistry'

describe('identity provider registry', () => {
  const originalEnvironment = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnvironment,
      ENTRA_ALLOWED_TENANTS: 'tenant-1,tenant-2',
      ENTRA_TENANT_ROLE_MAPPINGS: JSON.stringify({
        'tenant-2': {
          attribute: 'extension.providerRole',
          providerValues: ['lab-owner'],
          adminValues: ['lab-admin'],
          substringMatch: true,
        },
      }),
    }
    resetRegistry()
  })

  afterEach(() => {
    process.env = originalEnvironment
    resetRegistry()
  })

  test('keeps tenant-specific mappings isolated', () => {
    expect(getRoleMappingRules('entra-id', 'tenant-2')).toMatchObject({
      attribute: 'extension.providerRole',
      providerValues: ['lab-owner'],
      adminValues: ['lab-admin'],
      substringMatch: true,
    })
    expect(getRoleMappingRules('entra', 'tenant-1')).toMatchObject({
      attribute: 'roles',
      providerValues: ['provider'],
      adminValues: ['admin'],
    })
    expect(findIdPByProvider('entra-id', 'tenant-unknown')).toBeNull()
  })
})
