/**
 * Microsoft Entra ID Claims Adapter
 *
 * Translates raw claims from a Microsoft Entra ID id_token (or userinfo)
 * into the DecentraLabs canonical principal model.
 *
 * Entra-specific claims handled here:
 *   tid   → tenantId
 *   oid   → externalSubject (stable per-tenant per-user GUID)
 *   azp / appid → clientId
 *   preferred_username / upn / email → email
 *   name  → name
 *   roles → roles (app roles assigned in Entra)
 *   iss   → externalIssuer
 *
 * References:
 *   - https://learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference
 *   - PLAN_ENTRA_OKTA_M2M_SUPPORT.md § 4.4 / § 5.2
 */

import { PrincipalType, AuthMethod, buildFederatedSub } from './principal.js'

// ─── Tenant allow-list ──────────────────────────────────────────────────────

/**
 * Returns the list of allowed Entra tenant IDs from environment.
 * Format: comma-separated UUIDs or 'any' to accept all tenants.
 *
 * @returns {string[]|'any'}
 */
function getAllowedTenants() {
  const raw = process.env.ENTRA_ALLOWED_TENANTS || 'any'
  if (raw.trim().toLowerCase() === 'any') return 'any'
  return raw.split(',').map((t) => t.trim()).filter(Boolean)
}

// ─── Institution ID derivation ──────────────────────────────────────────────

/**
 * Derives the normalized institution domain (schacHomeOrganization-style)
 * from Entra claims.
 *
 * Resolution order:
 *  1. `schacHomeOrganization` custom claim (if the institution mapped it)
 *  2. Email domain
 *  3. null (institution lookup will fall back gracefully in guards.js)
 *
 * @param {Object} claims - Raw Entra ID token claims
 * @returns {string|null}
 */
function deriveInstitutionId(claims) {
  // 1. Custom claim: some institutions configure this in their Entra token policy
  if (claims.schacHomeOrganization && typeof claims.schacHomeOrganization === 'string') {
    return claims.schacHomeOrganization.trim().toLowerCase()
  }

  // 2. Email domain (preferred_username is usually user@institution.edu)
  const email =
    claims.preferred_username ||
    claims.upn ||
    claims.email ||
    null

  if (email && email.includes('@')) {
    return email.split('@')[1].toLowerCase()
  }

  return null
}

// ─── Main adapter ───────────────────────────────────────────────────────────

/**
 * Build a CanonicalPrincipal from raw Microsoft Entra ID token claims.
 *
 * @param {Object} claims - Decoded id_token payload from openid-client
 * @returns {import('./principal.js').CanonicalPrincipal}
 * @throws {Error} If required claims are missing or tenant is not allowed
 */
export function buildCanonicalPrincipalFromEntra(claims) {
  if (!claims || typeof claims !== 'object') {
    throw new Error('[EntraAdapter] claims must be a non-null object')
  }

  // Required: oid — stable per-tenant user identifier
  const oid = claims.oid
  if (!oid) {
    throw new Error('[EntraAdapter] Missing required claim: oid')
  }

  // Required: tid — tenant the token was issued for
  const tid = claims.tid
  if (!tid) {
    throw new Error('[EntraAdapter] Missing required claim: tid')
  }

  // Required: iss
  const iss = claims.iss
  if (!iss) {
    throw new Error('[EntraAdapter] Missing required claim: iss')
  }

  // Tenant allow-list validation
  const allowedTenants = getAllowedTenants()
  if (allowedTenants !== 'any' && !allowedTenants.includes(tid)) {
    throw new Error(`[EntraAdapter] Tenant '${tid}' is not in the allowed tenant list`)
  }

  // Email — preferred_username is the UPN (e.g. user@institution.edu)
  const email =
    claims.preferred_username ||
    claims.upn ||
    claims.email ||
    null

  // clientId — app that requested the token (azp for delegated, appid for application)
  const clientId = claims.azp || claims.appid || null

  // Roles — app roles configured in Entra App Registration
  const roles = Array.isArray(claims.roles)
    ? claims.roles
    : typeof claims.roles === 'string'
      ? [claims.roles]
      : []

  const institutionId = deriveInstitutionId(claims)

  return {
    principalType: PrincipalType.HUMAN,
    sub: buildFederatedSub(AuthMethod.ENTRA, tid, oid),
    externalIssuer: iss,
    externalSubject: oid,
    tenantId: tid,
    clientId,
    institutionId,
    email,
    name: claims.name || null,
    roles,
    authMethod: AuthMethod.ENTRA,
  }
}

/**
 * Convert a CanonicalPrincipal (from Entra) into the session userData shape
 * expected by createSessionCookie / getSessionFromCookies.
 *
 * This mapping keeps parity with the SAML userData object built in sso.js
 * so that guards.js works identically for both auth methods.
 *
 * @param {import('./principal.js').CanonicalPrincipal} principal
 * @returns {Object} sessionData object compatible with createSessionCookie
 */
export function principalToSessionData(principal) {
  return {
    // Core identity — mirrors SAML's `id` field
    id: principal.sub,

    email: principal.email,
    name: principal.name,

    // Auth method metadata
    authType: 'sso',        // keeps guards.js isSsoSession check working
    authMethod: principal.authMethod,           // 'entra'
    isSSO: true,

    // Institution resolution — used by guards.js → resolveInstitutionWalletFromSession
    // Maps institutionId to the same fields guards.js already reads
    affiliation: principal.institutionId,
    schacHomeOrganization: principal.institutionId,

    // Entra-specific identity claims (canonical)
    principalType: principal.principalType,
    externalIssuer: principal.externalIssuer,
    externalSubject: principal.externalSubject,
    tenantId: principal.tenantId,
    institutionId: principal.institutionId,
    clientId: principal.clientId,

    roles: principal.roles,
  }
}
