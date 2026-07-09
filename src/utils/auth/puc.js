import { keccak256, toUtf8Bytes } from 'ethers'

export const SAML_STABLE_USER_ID_MODES = Object.freeze({
  PRINCIPAL: 'principal',
  PRINCIPAL_TARGETED_ID: 'principal_targeted_id',
})

export function getSamlStableUserIdMode() {
  const configured = process.env.NEXT_PUBLIC_SAML_STABLE_USER_ID_MODE?.trim().toLowerCase()
  return configured === SAML_STABLE_USER_ID_MODES.PRINCIPAL
    ? SAML_STABLE_USER_ID_MODES.PRINCIPAL
    : SAML_STABLE_USER_ID_MODES.PRINCIPAL_TARGETED_ID
}

export function shouldIncludeEduPersonTargetedId() {
  return getSamlStableUserIdMode() === SAML_STABLE_USER_ID_MODES.PRINCIPAL_TARGETED_ID
}

/**
 * Normalize an identifier string.
 * Historically this was used for SCHAC Personal Unique Codes, but it now
 * also functions as a generic normalizer for the stable PUC-compatible
 * identifier derived from the SAML session.
 * If the value resembles a SCHAC PUC urn we still strip the urn semantics,
 * otherwise the trimmed string is returned verbatim.
 *
 * @param {string | null | undefined} value
 * @returns {string | null}
 */
export function normalizePuc(value) {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  const lower = trimmed.toLowerCase()
  if (!lower.includes('personaluniquecode') && !lower.includes('schacpersonaluniquecode')) {
    return lower
  }

  const segments = trimmed
    .split(':')
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (segments.length === 0) {
    return lower
  }

  return segments[segments.length - 1].toLowerCase()
}

/**
 * Resolve a stable shared user identifier from an authenticated session.
 *
 * Canonical format for on-chain usage, controlled by NEXT_PUBLIC_SAML_STABLE_USER_ID_MODE:
 *   - eduPersonPrincipalName
 *   - eduPersonPrincipalName|eduPersonTargetedID
 *
 * @param {Object} session
 * @returns {string | null}
 */
export function getNormalizedPucFromSession(session) {
  const principalNameRaw = session?.eduPersonPrincipalName
  const targetedIdRaw = session?.eduPersonTargetedID
  const principalName = typeof principalNameRaw === 'string' ? principalNameRaw.trim() : ''
  const targetedId = typeof targetedIdRaw === 'string' ? targetedIdRaw.trim() : ''

  if (principalName) {
    const stableId = shouldIncludeEduPersonTargetedId() && targetedId
      ? `${principalName}|${targetedId}`
      : principalName
    return stableId.toLowerCase()
  }

  return null
}

export function hashNormalizedPuc(value) {
  const normalized = normalizePuc(value)
  if (!normalized) return null
  return keccak256(toUtf8Bytes(normalized))
}

export function getPucHashFromSession(session) {
  const normalized = getNormalizedPucFromSession(session)
  if (!normalized) return null
  return keccak256(toUtf8Bytes(normalized))
}
