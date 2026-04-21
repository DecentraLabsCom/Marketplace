import { keccak256, toUtf8Bytes } from 'ethers'

/**
 * Normalize an identifier string.
 * Historically this was used for SCHAC Personal Unique Codes, but it now
 * also functions as a generic normalizer for whatever stable user ID we
 * derive from the SAML session (e.g. eduPersonTargetedID or session id).
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
 * Canonical format for on-chain usage:
 *   - eduPersonPrincipalName
 *   - eduPersonPrincipalName|eduPersonTargetedID
 *
 * @param {Object} session
 * @returns {string | null}
 */
export function getNormalizedPucFromSession(session) {
  const candidates = getNormalizedPucCandidatesFromSession(session)
  return candidates[0] || null
}

/**
 * Resolve all compatible stable identifier candidates from a session.
 *
 * Order is important and preserves canonical preference:
 *  1) eduPersonPrincipalName|eduPersonTargetedID
 *  2) eduPersonPrincipalName
 *  3) session.id
 *
 * @param {Object} session
 * @returns {string[]}
 */
export function getNormalizedPucCandidatesFromSession(session) {
  const principalNameRaw = session?.eduPersonPrincipalName
  const targetedIdRaw = session?.eduPersonTargetedID

  const principalName = normalizePuc(principalNameRaw)
  const targetedId = normalizePuc(targetedIdRaw)
  const sessionId = normalizePuc(session?.id)

  const candidates = []

  if (principalName && targetedId) {
    candidates.push(`${principalName}|${targetedId}`)
  }

  if (principalName) {
    candidates.push(principalName)
  }

  if (sessionId) {
    candidates.push(sessionId)
  }

  return Array.from(new Set(candidates))
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

/**
 * Resolve all compatible PUC hash candidates from a session.
 * @param {Object} session
 * @returns {string[]}
 */
export function getPucHashCandidatesFromSession(session) {
  return getNormalizedPucCandidatesFromSession(session)
    .map((value) => keccak256(toUtf8Bytes(value)))
}
