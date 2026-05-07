/**
 * Role Mapper — DecentraLabs
 *
 * Pure evaluation engine that translates raw IdP claims into canonical
 * DecentraLabs roles using the rules defined in idpRegistry.js.
 *
 * This module contains zero IdP-specific logic. It only knows how to
 * evaluate a rule against a set of claims. All IdP differences live in
 * idpRegistry.js (which attribute to read, which values are valid).
 *
 * Design (PLAN_ENTRA_OKTA_M2M_SUPPORT.md § 4.2 / § 5.2):
 *  - Business logic must consume canonical roles, not raw claims.
 *  - This mapper is the single place where "raw claim value" → "canonical role"
 *    translation happens.
 *  - It is intentionally stateless and side-effect free for easy testing.
 */

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Normalize a value to an array of strings.
 * Handles: string, string[], undefined/null.
 *
 * @param {*} value
 * @returns {string[]}
 */
function toStringArray(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.map(String)
  return [String(value)]
}

/**
 * Check if a single candidate value matches any of the target values,
 * applying case/substring options from the rule.
 *
 * @param {string} candidate
 * @param {string[]} targets
 * @param {boolean} caseInsensitive
 * @param {boolean} substringMatch
 * @returns {boolean}
 */
function matchesAny(candidate, targets, caseInsensitive, substringMatch) {
  const normalize = (v) => (caseInsensitive ? v.toLowerCase() : v)
  const normalizedCandidate = normalize(candidate)

  return targets.some((target) => {
    const normalizedTarget = normalize(target)
    return substringMatch
      ? normalizedCandidate.includes(normalizedTarget)
      : normalizedCandidate === normalizedTarget
  })
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Evaluate whether a set of raw IdP claims grants a specific canonical role,
 * according to the provided rule.
 *
 * @param {Object} rawClaims        — Raw token claims from the IdP
 * @param {import('./idpRegistry.js').RoleMappingRule} rule — Mapping rule from the registry
 * @param {'provider'|'admin'} targetRole — Which canonical role to evaluate
 * @returns {boolean}
 */
export function evaluateRole(rawClaims, rule, targetRole) {
  if (!rawClaims || !rule) return false

  const { attribute, providerValues, adminValues, caseInsensitive, substringMatch } = rule

  // Read the attribute from claims
  const claimValue = rawClaims[attribute]
  if (claimValue === undefined || claimValue === null) return false

  // Normalize to array (claim may be a single string or an array)
  const candidateValues = toStringArray(claimValue)
  if (candidateValues.length === 0) return false

  // Select which target list to match against
  const targets = targetRole === 'admin' ? (adminValues ?? []) : (providerValues ?? [])
  if (targets.length === 0) return false

  return candidateValues.some((candidate) =>
    matchesAny(candidate, targets, caseInsensitive ?? true, substringMatch ?? false)
  )
}

/**
 * Map raw IdP claims to the full set of canonical DecentraLabs roles
 * using a role mapping rule.
 *
 * Returns an array that may contain: 'provider', 'admin'
 * (plus any other roles added in the future without code changes).
 *
 * @param {Object} rawClaims
 * @param {import('./idpRegistry.js').RoleMappingRule|null} rule
 * @returns {string[]} — Array of canonical role strings granted to this principal
 */
export function mapClaimsToRoles(rawClaims, rule) {
  if (!rawClaims || !rule) return []

  const granted = []

  if (evaluateRole(rawClaims, rule, 'admin')) {
    granted.push('admin')
  }

  if (evaluateRole(rawClaims, rule, 'provider')) {
    granted.push('provider')
  }

  return granted
}

/**
 * Convenience: return true if the claims grant at least the 'provider' role.
 *
 * @param {Object} rawClaims
 * @param {import('./idpRegistry.js').RoleMappingRule|null} rule
 * @returns {boolean}
 */
export function isProvider(rawClaims, rule) {
  return evaluateRole(rawClaims, rule, 'provider')
}

/**
 * Convenience: return true if the claims grant the 'admin' role.
 *
 * @param {Object} rawClaims
 * @param {import('./idpRegistry.js').RoleMappingRule|null} rule
 * @returns {boolean}
 */
export function isAdmin(rawClaims, rule) {
  return evaluateRole(rawClaims, rule, 'admin')
}
