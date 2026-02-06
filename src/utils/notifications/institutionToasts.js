export const institutionToastIds = {
  provisioningAccessDenied: (tokenType) => `institution-provisioning-access-denied:${String(tokenType || 'provider')}`,
  publicBaseUrlRequired: () => 'institution-public-base-url-required',
  provisioningGenerated: (tokenType) => `institution-provisioning-generated:${String(tokenType || 'provider')}`,
  provisioningGenerateFailed: (tokenType) => `institution-provisioning-generate-failed:${String(tokenType || 'provider')}`,
  clipboardUnavailable: () => 'institution-clipboard-unavailable',
  tokenCopied: () => 'institution-token-copied',
  tokenCopyFailed: () => 'institution-token-copy-failed',
  providerRegisterMissingUser: () => 'institution-provider-register-missing-user',
  providerRegisterWalletRequired: () => 'institution-provider-register-wallet-required',
  providerInviteGenerated: () => 'institution-provider-invite-generated',
  providerInviteGenerationFailed: () => 'institution-provider-invite-generation-failed',
  providerRegistrationFailed: () => 'institution-provider-registration-failed',
}

const notify = (addTemporaryNotification, type, message, dedupeKey, extraOptions = {}) => {
  if (typeof addTemporaryNotification !== 'function') return
  addTemporaryNotification(type, message, null, {
    dedupeKey,
    dedupeWindowMs: 20000,
    ...extraOptions,
  })
}

export const notifyInstitutionProvisioningAccessDenied = (addTemporaryNotification, tokenType = 'provider') =>
  notify(
    addTemporaryNotification,
    'error',
    `${tokenType === 'consumer' ? 'Consumer' : 'Provisioning'} token is only available for authorized institutional staff (SSO).`,
    institutionToastIds.provisioningAccessDenied(tokenType)
  )

export const notifyInstitutionPublicBaseUrlRequired = (addTemporaryNotification) =>
  notify(
    addTemporaryNotification,
    'error',
    'Public base URL (https://) is required.',
    institutionToastIds.publicBaseUrlRequired()
  )

export const notifyInstitutionProvisioningGenerated = (addTemporaryNotification, tokenType = 'provider') =>
  notify(
    addTemporaryNotification,
    'success',
    `${tokenType === 'consumer' ? 'Consumer provisioning' : 'Provisioning'} token generated successfully.`,
    institutionToastIds.provisioningGenerated(tokenType)
  )

export const notifyInstitutionProvisioningGenerationFailed = (
  addTemporaryNotification,
  tokenType = 'provider',
  message = null
) =>
  notify(
    addTemporaryNotification,
    'error',
    message || `Failed to generate ${tokenType === 'consumer' ? 'consumer provisioning' : 'provisioning'} token.`,
    institutionToastIds.provisioningGenerateFailed(tokenType)
  )

export const notifyInstitutionClipboardUnavailable = (addTemporaryNotification) =>
  notify(addTemporaryNotification, 'error', 'Clipboard is not available.', institutionToastIds.clipboardUnavailable())

export const notifyInstitutionTokenCopied = (addTemporaryNotification) =>
  notify(addTemporaryNotification, 'success', 'Provisioning token copied to clipboard.', institutionToastIds.tokenCopied())

export const notifyInstitutionTokenCopyFailed = (addTemporaryNotification) =>
  notify(addTemporaryNotification, 'error', 'Failed to copy provisioning token to clipboard.', institutionToastIds.tokenCopyFailed())

export const notifyInstitutionProviderRegisterMissingUser = (addTemporaryNotification) =>
  notify(
    addTemporaryNotification,
    'error',
    'User information is not available for institutional registration.',
    institutionToastIds.providerRegisterMissingUser()
  )

export const notifyInstitutionProviderRegisterWalletRequired = (addTemporaryNotification) =>
  notify(
    addTemporaryNotification,
    'error',
    'Please connect your institutional wallet before registering as a provider.',
    institutionToastIds.providerRegisterWalletRequired()
  )

export const notifyInstitutionProviderInviteGenerated = (addTemporaryNotification) =>
  notify(
    addTemporaryNotification,
    'success',
    'Institution invite token generated.',
    institutionToastIds.providerInviteGenerated()
  )

export const notifyInstitutionProviderInviteGenerationFailed = (addTemporaryNotification, message = null) =>
  notify(
    addTemporaryNotification,
    'error',
    message || 'Failed to generate institution invite token.',
    institutionToastIds.providerInviteGenerationFailed()
  )

export const notifyInstitutionProviderRegistrationFailed = (addTemporaryNotification, message = null) =>
  notify(
    addTemporaryNotification,
    'error',
    message || 'Institutional provider registration failed.',
    institutionToastIds.providerRegistrationFailed()
  )

