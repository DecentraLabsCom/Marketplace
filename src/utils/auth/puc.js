/**
 * Normalize institutional user identifiers that may arrive as SCHAC PUC URNs.
 * For values like `urn:...:personalUniqueCode:...:<PUC>`, returns the trailing
 * non-empty segment (`<PUC>`). Non-URN/non-SCHAC values are returned trimmed.
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
 * Resolve and normalize PUC from an authenticated session object.
 *
 * @param {Object} session
 * @returns {string | null}
 */
export function getNormalizedPucFromSession(session) {
  const raw =
    session?.schacPersonalUniqueCode ||
    session?.personalUniqueCode ||
    session?.puc ||
    session?.personal_unique_code ||
    null

  return normalizePuc(raw)
}

