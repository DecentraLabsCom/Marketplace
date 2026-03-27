/**
 * Canonical Identity Model — DecentraLabs
 *
 * Every token issued by the Marketplace must carry an explicit principal.
 * This module defines the canonical shape used throughout the auth layer
 * so that business logic never depends on raw claims from any external IdP.
 *
 * References:
 *   - PLAN_ENTRA_OKTA_M2M_SUPPORT.md § 4.3 / § 4.4
 */

/** Discriminated union for principal kinds */
export const PrincipalType = /** @type {const} */ ({
  HUMAN: 'human',
  WORKLOAD: 'workload',
})

/** Authentication method identifiers */
export const AuthMethod = /** @type {const} */ ({
  ENTRA: 'entra',
  OKTA: 'okta',
  SAML: 'saml',
  WALLET: 'wallet',
})

/**
 * Canonical principal as stored in the Marketplace session cookie and
 * forwarded as JWT claims to blockchain-services.
 *
 * @typedef {Object} CanonicalPrincipal
 *
 * Identity type
 * @property {'human'|'workload'} principalType
 *
 * Stable internal DecentraLabs subject.
 * Format: `{authMethod}:{tenantId}:{externalSubject}` for federated principals.
 * @property {string} sub
 *
 * OIDC issuer of the external IdP that authenticated this principal.
 * Example: `https://login.microsoftonline.com/{tid}/v2.0`
 * @property {string} externalIssuer
 *
 * Subject claim from the external IdP (`oid` for Entra, `sub` for Okta).
 * @property {string} externalSubject
 *
 * IdP-specific tenant / organization identifier.
 * Microsoft Entra: `tid`. Okta: authorization server URL.
 * @property {string|null} tenantId
 *
 * OAuth2 client ID of the application (workloads: azp / appid; humans: azp of the app used).
 * @property {string|null} clientId
 *
 * Normalized institution domain (schacHomeOrganization-style, lowercase).
 * Used to resolve the on-chain institutional wallet via the smart contract.
 * @property {string|null} institutionId
 *
 * User email (humans only; null for unattended workloads).
 * @property {string|null} email
 *
 * Display name (humans only).
 * @property {string|null} name
 *
 * Roles/groups received from the IdP, forwarded as-is.
 * @property {string[]} roles
 *
 * Which authentication method was used.
 * @property {'entra'|'okta'|'saml'|'wallet'} authMethod
 */

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a stable internal `sub` for federated principals.
 * Format keeps the authMethod as a namespace so sub values are distinct
 * across different IdP types even if tenant/subject happen to collide.
 *
 * @param {string} authMethod - One of AuthMethod values
 * @param {string|null} tenantId
 * @param {string} externalSubject
 * @returns {string}
 */
export function buildFederatedSub(authMethod, tenantId, externalSubject) {
  const tenant = tenantId || 'unknown-tenant'
  return `${authMethod}:${tenant}:${externalSubject}`
}

/**
 * Minimal validation of a CanonicalPrincipal.
 * Throws if required fields are missing.
 *
 * @param {CanonicalPrincipal} principal
 * @throws {Error}
 */
export function assertCanonicalPrincipal(principal) {
  if (!principal || typeof principal !== 'object') {
    throw new Error('principal must be a non-null object')
  }
  if (!Object.values(PrincipalType).includes(principal.principalType)) {
    throw new Error(`principalType must be one of: ${Object.values(PrincipalType).join(', ')}`)
  }
  if (!principal.sub) {
    throw new Error('principal.sub is required')
  }
  if (!principal.externalIssuer) {
    throw new Error('principal.externalIssuer is required')
  }
  if (!principal.externalSubject) {
    throw new Error('principal.externalSubject is required')
  }
  if (!Object.values(AuthMethod).includes(principal.authMethod)) {
    throw new Error(`principal.authMethod must be one of: ${Object.values(AuthMethod).join(', ')}`)
  }
}
