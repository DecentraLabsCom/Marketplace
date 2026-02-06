import {
  institutionToastIds,
  notifyInstitutionClipboardUnavailable,
  notifyInstitutionProviderInviteGenerated,
  notifyInstitutionProviderInviteGenerationFailed,
  notifyInstitutionProviderRegisterMissingUser,
  notifyInstitutionProviderRegisterWalletRequired,
  notifyInstitutionProviderRegistrationFailed,
  notifyInstitutionProvisioningAccessDenied,
  notifyInstitutionProvisioningGenerated,
  notifyInstitutionProvisioningGenerationFailed,
  notifyInstitutionPublicBaseUrlRequired,
  notifyInstitutionTokenCopied,
  notifyInstitutionTokenCopyFailed,
} from '../institutionToasts'

describe('institutionToasts', () => {
  const addTemporaryNotification = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('builds dedupe ids for provider and consumer flows', () => {
    expect(institutionToastIds.provisioningAccessDenied('provider')).toBe('institution-provisioning-access-denied:provider')
    expect(institutionToastIds.provisioningGenerated('consumer')).toBe('institution-provisioning-generated:consumer')
  })

  test('emits provisioning-related toasts with unified notification signature', () => {
    notifyInstitutionProvisioningAccessDenied(addTemporaryNotification, 'provider')
    notifyInstitutionProvisioningAccessDenied(addTemporaryNotification, 'consumer')
    notifyInstitutionPublicBaseUrlRequired(addTemporaryNotification)
    notifyInstitutionProvisioningGenerated(addTemporaryNotification, 'provider')
    notifyInstitutionProvisioningGenerated(addTemporaryNotification, 'consumer')
    notifyInstitutionProvisioningGenerationFailed(addTemporaryNotification, 'provider', 'custom provider error')
    notifyInstitutionProvisioningGenerationFailed(addTemporaryNotification, 'consumer', 'custom consumer error')
    notifyInstitutionClipboardUnavailable(addTemporaryNotification)
    notifyInstitutionTokenCopied(addTemporaryNotification)
    notifyInstitutionTokenCopyFailed(addTemporaryNotification)

    const calls = addTemporaryNotification.mock.calls
    expect(calls).toHaveLength(10)
    expect(calls[0][3]).toEqual(expect.objectContaining({ dedupeKey: 'institution-provisioning-access-denied:provider', dedupeWindowMs: 20000 }))
    expect(calls[1][3]).toEqual(expect.objectContaining({ dedupeKey: 'institution-provisioning-access-denied:consumer', dedupeWindowMs: 20000 }))
    expect(calls[2][3]).toEqual(expect.objectContaining({ dedupeKey: 'institution-public-base-url-required', dedupeWindowMs: 20000 }))
    expect(calls[3][3]).toEqual(expect.objectContaining({ dedupeKey: 'institution-provisioning-generated:provider', dedupeWindowMs: 20000 }))
    expect(calls[4][3]).toEqual(expect.objectContaining({ dedupeKey: 'institution-provisioning-generated:consumer', dedupeWindowMs: 20000 }))
    expect(calls[5][1]).toContain('custom provider error')
    expect(calls[5][3]).toEqual(expect.objectContaining({ dedupeKey: 'institution-provisioning-generate-failed:provider', dedupeWindowMs: 20000 }))
    expect(calls[6][1]).toContain('custom consumer error')
    expect(calls[6][3]).toEqual(expect.objectContaining({ dedupeKey: 'institution-provisioning-generate-failed:consumer', dedupeWindowMs: 20000 }))
    expect(calls[7][3]).toEqual(expect.objectContaining({ dedupeKey: 'institution-clipboard-unavailable', dedupeWindowMs: 20000 }))
    expect(calls[8][3]).toEqual(expect.objectContaining({ dedupeKey: 'institution-token-copied', dedupeWindowMs: 20000 }))
    expect(calls[9][3]).toEqual(expect.objectContaining({ dedupeKey: 'institution-token-copy-failed', dedupeWindowMs: 20000 }))
  })

  test('emits provider registration toasts with unified notification signature', () => {
    notifyInstitutionProviderRegisterMissingUser(addTemporaryNotification)
    notifyInstitutionProviderRegisterWalletRequired(addTemporaryNotification)
    notifyInstitutionProviderInviteGenerated(addTemporaryNotification)
    notifyInstitutionProviderInviteGenerationFailed(addTemporaryNotification, 'invite failed')
    notifyInstitutionProviderRegistrationFailed(addTemporaryNotification, 'registration failed')

    const calls = addTemporaryNotification.mock.calls
    expect(calls).toHaveLength(5)
    expect(calls[0][3]).toEqual(expect.objectContaining({ dedupeKey: 'institution-provider-register-missing-user' }))
    expect(calls[1][3]).toEqual(expect.objectContaining({ dedupeKey: 'institution-provider-register-wallet-required' }))
    expect(calls[2][3]).toEqual(expect.objectContaining({ dedupeKey: 'institution-provider-invite-generated' }))
    expect(calls[3][3]).toEqual(expect.objectContaining({ dedupeKey: 'institution-provider-invite-generation-failed' }))
    expect(calls[4][3]).toEqual(expect.objectContaining({ dedupeKey: 'institution-provider-registration-failed' }))
  })

  test('no-ops when callback is not provided', () => {
    expect(() => notifyInstitutionProvisioningGenerated(undefined, 'provider')).not.toThrow()
    expect(() => notifyInstitutionProviderRegistrationFailed(null)).not.toThrow()
  })
})

