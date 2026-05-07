/**
 * Okta Adapter — STUB (Phase 2)
 *
 * This file is a placeholder for the future Okta OIDC adapter.
 * It intentionally throws at runtime so any accidental early invocation
 * is immediately visible in logs rather than silently failing.
 *
 * ── How to implement (when the time comes) ────────────────────────────────
 *
 * 1. Environment variables needed (add to .env.local and Vercel):
 *      OKTA_DOMAIN=dev-xxxxxxxx.okta.com
 *      OKTA_CLIENT_ID=...
 *      OKTA_CLIENT_SECRET=...
 *      OKTA_REDIRECT_URI=http://localhost:3000/api/auth/okta/callback
 *      OKTA_PROVIDER_GROUP_VALUES=G-LabProviders,G-Admins
 *      OKTA_ADMIN_GROUP_VALUES=G-PlatformAdmins
 *
 * 2. Okta-specific claims to handle (differs from Entra):
 *      sub        → externalSubject  (opaque string, not a GUID like Entra's oid)
 *      cid        → clientId         (Okta uses 'cid', Entra uses 'azp'/'appid')
 *      groups     → roles            (Okta sends group names; Entra sends app roles)
 *      scp        → scopes
 *
 * 3. Implement buildCanonicalPrincipal(claims) following the same pattern
 *    as entraIdAdapter.js:
 *      - Validate required claims (sub, iss)
 *      - Derive institutionId from email domain or custom claim
 *      - Call getRoleMappingRules('okta', tenantId) from idpRegistry.js
 *      - Call mapClaimsToRoles(claims, rule) from roleMapper.js
 *      - Return a CanonicalPrincipal with authMethod: AuthMethod.OKTA
 *
 * 4. Implement principalToSessionData(principal) — identical shape to Entra's.
 *
 * 5. Add Okta discovery + PKCE routes:
 *      src/app/api/auth/okta/login/route.js
 *      src/app/api/auth/okta/callback/route.js
 *    (copy the Entra routes as a template; only the oidcClient provider changes)
 *
 * 6. Uncomment the Okta entry in idpRegistry.js.
 *
 * 7. Register this adapter in idpAdapters/index.js.
 *
 * References:
 *  - https://developer.okta.com/docs/reference/api/oidc/
 *  - PLAN_ENTRA_OKTA_M2M_SUPPORT.md § 5.3
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const PROVIDER_ID = 'okta'

/**
 * @throws {Error} Always — Okta integration not yet implemented
 */
export function buildCanonicalPrincipal(_claims) {
  throw new Error(
    '[OktaAdapter] Okta integration is not yet implemented. ' +
    'See src/utils/auth/idpAdapters/oktaAdapter.js for implementation instructions.'
  )
}

/**
 * @throws {Error} Always — Okta integration not yet implemented
 */
export function principalToSessionData(_principal) {
  throw new Error(
    '[OktaAdapter] Okta integration is not yet implemented. ' +
    'See src/utils/auth/idpAdapters/oktaAdapter.js for implementation instructions.'
  )
}
