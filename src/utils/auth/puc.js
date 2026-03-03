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
    return trimmed
  }

  const segments = trimmed
    .split(':')
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (segments.length === 0) {
    return trimmed
  }

  return segments[segments.length - 1]
}

/**
 * Resolve a stable user identifier from an authenticated session object.
 *
 * Prefer persistent federated identifiers first, then generic IDs.
 * Only if none of those are present do we fall back to legacy PUC-related
 * fields for compatibility.
 *
 * @param {Object} session
 * @returns {string | null}
 */
export function getNormalizedPucFromSession(session) {
  // preferred modern identifiers
  const preferred =
    session?.eduPersonTargetedID ||
    session?.eduPersonPrincipalName ||
    session?.id ||
    session?.email ||
    null

  if (preferred) {
    const trimmed = String(preferred).trim()
    return trimmed || null
  }

  // legacy fallback, normalized as before
  const raw =
    session?.schacPersonalUniqueCode ||
    session?.personalUniqueCode ||
    session?.puc ||
    session?.personal_unique_code ||
    null

  return normalizePuc(raw)
}

