export const MARKETPLACE_SESSION_TTL_SECONDS = 60 * 60
export const MARKETPLACE_SESSION_RENEWAL_THRESHOLD_SECONDS = 15 * 60
export const MARKETPLACE_SAML_SESSION_SAFETY_MARGIN_SECONDS = 60
export const MARKETPLACE_SAML_REAUTH_MARGIN_SECONDS = 2 * 60

/**
 * Resolves the maximum lifetime for a Marketplace session.
 *
 * A SAML assertion has an absolute validity window, so a sliding Marketplace
 * session must never outlive the assertion stored in that session.
 */
export function resolveSessionTtlSeconds(
  sessionData,
  requestedTtl = MARKETPLACE_SESSION_TTL_SECONDS,
  now = Date.now(),
) {
  const ttl = Number(requestedTtl)
  if (!Number.isSafeInteger(ttl) || ttl <= 0) throw new Error('Invalid session TTL')

  const rawAssertionExpiry = sessionData?.samlAssertionExpiresAt
  if (rawAssertionExpiry === undefined || rawAssertionExpiry === null) return ttl

  const assertionExpiresAt = Number(rawAssertionExpiry)
  const currentTime = Number(now)
  if (!Number.isFinite(assertionExpiresAt) || !Number.isFinite(currentTime)) {
    throw new Error('Invalid SAML assertion expiry')
  }

  const remainingSeconds = Math.floor((assertionExpiresAt - currentTime) / 1000)
    - MARKETPLACE_SAML_SESSION_SAFETY_MARGIN_SECONDS
  if (remainingSeconds <= 0) throw new Error('SAML assertion is too close to expiry')

  return Math.min(ttl, remainingSeconds)
}
