/**
 * Provider-neutral role mapping.
 *
 * IdP adapters provide raw claims and a registry rule. This module only
 * evaluates the rule and returns DecentraLabs roles; provider-specific claim
 * names and values belong in the registry.
 */

const CANONICAL_ROLES = Object.freeze({
  PROVIDER: 'provider',
  ADMIN: 'admin',
})

function toStringArray(value) {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function matchesAny(candidate, targets, { caseInsensitive = true, substringMatch = false } = {}) {
  const normalizedCandidate = caseInsensitive ? candidate.toLowerCase() : candidate
  return targets.some((target) => {
    const normalizedTarget = caseInsensitive ? target.toLowerCase() : target
    return substringMatch
      ? normalizedCandidate.includes(normalizedTarget)
      : normalizedCandidate === normalizedTarget
  })
}

function readClaim(claims, attribute) {
  if (!claims || typeof claims !== 'object' || typeof attribute !== 'string') return undefined
  return attribute.split('.').reduce((value, part) => {
    if (!value || typeof value !== 'object') return undefined
    return value[part]
  }, claims)
}

export function evaluateRole(claims, rule, targetRole) {
  if (!rule || typeof rule.attribute !== 'string' || !rule.attribute.trim()) return false
  const targets = targetRole === CANONICAL_ROLES.ADMIN
    ? toStringArray(rule.adminValues)
    : targetRole === CANONICAL_ROLES.PROVIDER
      ? toStringArray(rule.providerValues)
      : []
  if (!targets.length) return false

  return toStringArray(readClaim(claims, rule.attribute.trim()))
    .some((candidate) => matchesAny(candidate, targets, rule))
}

export function mapClaimsToRoles(claims, rule) {
  const roles = []
  if (evaluateRole(claims, rule, CANONICAL_ROLES.ADMIN)) roles.push(CANONICAL_ROLES.ADMIN)
  if (evaluateRole(claims, rule, CANONICAL_ROLES.PROVIDER)) roles.push(CANONICAL_ROLES.PROVIDER)
  return roles
}

export function isProvider(claims, rule) {
  return evaluateRole(claims, rule, CANONICAL_ROLES.PROVIDER)
}

export function isAdmin(claims, rule) {
  return evaluateRole(claims, rule, CANONICAL_ROLES.ADMIN)
}

export { CANONICAL_ROLES }

export default {
  CANONICAL_ROLES,
  evaluateRole,
  mapClaimsToRoles,
  isProvider,
  isAdmin,
}
