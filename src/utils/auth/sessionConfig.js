export const MARKETPLACE_SESSION_TTL_SECONDS = 60 * 60
export const MARKETPLACE_SESSION_RENEWAL_THRESHOLD_SECONDS = 15 * 60
export const MARKETPLACE_SAML_SESSION_SAFETY_MARGIN_SECONDS = 60
export const MARKETPLACE_SAML_REAUTH_MARGIN_SECONDS = 5 * 60

/**
 * Resolves the maximum lifetime for a Marketplace session.
 *
 * The institutional backend credential is the authoritative session horizon
 * after the SAML callback. The raw assertion is only a legacy fallback for
 * sessions created before that credential was available.
 */
export function resolveSessionTtlSeconds(
  sessionData,
  requestedTtl = MARKETPLACE_SESSION_TTL_SECONDS,
  now = Date.now(),
) {
  const ttl = Number(requestedTtl)
  if (!Number.isSafeInteger(ttl) || ttl <= 0) throw new Error('Invalid session TTL')

  const currentTime = Number(now)
  if (!Number.isFinite(currentTime)) throw new Error('Invalid current time')

  const remainingHorizons = []
  const backendSessionExpiry = sessionData?.institutionalBackendSessionExpiresAt
  const hasBackendSessionToken = typeof sessionData?.institutionalBackendSessionToken === 'string'
    && sessionData.institutionalBackendSessionToken.trim().length > 0
  const hasBackendSessionExpiry = backendSessionExpiry !== undefined && backendSessionExpiry !== null

  if (hasBackendSessionToken || hasBackendSessionExpiry) {
    if (!hasBackendSessionExpiry) throw new Error('Institutional session expiry is missing')
    const institutionalSessionExpiresAt = Number(backendSessionExpiry)
    if (!Number.isFinite(institutionalSessionExpiresAt)) {
      throw new Error('Invalid institutional session expiry')
    }
    const remainingSeconds = Math.floor((institutionalSessionExpiresAt - currentTime) / 1000)
    if (remainingSeconds <= 0) throw new Error('Institutional session is expired')
    remainingHorizons.push(remainingSeconds)
  }

  const rawAssertionExpiry = sessionData?.samlAssertionExpiresAt
  if (!hasBackendSessionToken && !hasBackendSessionExpiry
    && rawAssertionExpiry !== undefined && rawAssertionExpiry !== null) {
    const samlAssertionExpiresAt = Number(rawAssertionExpiry)
    if (!Number.isFinite(samlAssertionExpiresAt)) throw new Error('Invalid SAML assertion expiry')
    const remainingSeconds = Math.floor((samlAssertionExpiresAt - currentTime) / 1000)
      - MARKETPLACE_SAML_SESSION_SAFETY_MARGIN_SECONDS
    if (remainingSeconds <= 0) throw new Error('SAML assertion is too close to expiry')
    remainingHorizons.push(remainingSeconds)
  }

  return Math.min(ttl, ...remainingHorizons)
}

export function resolveSessionReauthenticationAt(sessionData) {
  const hasBackendSession = Number.isFinite(Number(sessionData?.institutionalBackendSessionExpiresAt))
    && Number(sessionData.institutionalBackendSessionExpiresAt) > 0
  if (hasBackendSession) {
    const backendReauthenticationAt = Number(sessionData?.institutionalReauthenticationAt)
    return Number.isFinite(backendReauthenticationAt) && backendReauthenticationAt > 0
      ? backendReauthenticationAt
      : Number(sessionData.institutionalBackendSessionExpiresAt)
  }

  const rawAssertionExpiry = Number(sessionData?.samlAssertionExpiresAt)
  return Number.isFinite(rawAssertionExpiry) && rawAssertionExpiry > 0
    ? rawAssertionExpiry
    : null
}
