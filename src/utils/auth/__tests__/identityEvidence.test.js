import {
  IDENTITY_EVIDENCE_HASH_VERSIONS,
  IDENTITY_PROTOCOLS,
  buildIdentityEvidence,
  hashIdentityEvidence,
} from '@/utils/auth/identityEvidence'

describe('identity evidence', () => {
  test('hashes the exact server-validated evidence deterministically', () => {
    const first = hashIdentityEvidence('signed-id-token')
    const second = hashIdentityEvidence('signed-id-token')

    expect(first).toMatch(/^0x[0-9a-f]{64}$/)
    expect(second).toBe(first)
    expect(hashIdentityEvidence('different-token')).not.toBe(first)
  })

  test('builds an OIDC evidence envelope without retaining raw token material', () => {
    const evidence = buildIdentityEvidence({
      protocol: IDENTITY_PROTOCOLS.OIDC,
      provider: 'entra-id',
      issuer: 'https://login.microsoftonline.com/tenant/v2.0',
      subject: 'oid-123',
      stableUserId: 'oidc:entra-id:tenant:oid-123',
      institutionId: 'uned.es',
      rawEvidence: 'signed-id-token',
    })

    expect(evidence).toMatchObject({
      protocol: 'oidc',
      provider: 'entra-id',
      issuer: 'https://login.microsoftonline.com/tenant/v2.0',
      subject: 'oid-123',
      stableUserId: 'oidc:entra-id:tenant:oid-123',
      institutionId: 'uned.es',
      evidenceHashVersion: IDENTITY_EVIDENCE_HASH_VERSIONS.OIDC_ID_TOKEN,
    })
    expect(evidence.evidenceHash).toBe(hashIdentityEvidence('signed-id-token'))
    expect(evidence.rawEvidence).toBeUndefined()
  })

  test('rejects incomplete evidence envelopes', () => {
    expect(() => buildIdentityEvidence({
      protocol: IDENTITY_PROTOCOLS.OIDC,
      provider: 'entra-id',
      issuer: 'https://issuer.example',
      subject: 'subject',
      stableUserId: 'stable-user',
      institutionId: 'uned.es',
    })).toThrow('Identity evidence hash is required')
  })
})
