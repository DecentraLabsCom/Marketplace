import { saveCredential } from '@/utils/webauthn/store'

describe('WebAuthn credential store', () => {
  it('rejects incomplete credential records', () => {
    expect(saveCredential(null)).toBeNull()
    expect(saveCredential({ puc: 'user@university.edu' })).toBeNull()
    expect(saveCredential({ credentialId: 'credential-1' })).toBeNull()
  })

  it('normalizes and timestamps a verified credential record', () => {
    const result = saveCredential({
      puc: 'user@university.edu',
      credentialId: 'credential-1',
      signCount: '4',
    })

    expect(result).toEqual(expect.objectContaining({
      puc: 'user@university.edu',
      credentialId: 'credential-1',
      signCount: 4,
      status: 'active',
    }))
    expect(Number.isNaN(Date.parse(result.updatedAt))).toBe(false)
  })
})
