/**
 * IdP Registry — DecentraLabs
 *
 * Central catalogue of all registered Identity Providers (IdPs).
 * Each entry describes:
 *  - which IdP/tenant is being registered
 *  - how to map IdP-specific claims to DecentraLabs canonical roles
 *
 * Design goals (PLAN_ENTRA_OKTA_M2M_SUPPORT.md § 4.2 / § 5.1):
 *  - IdP-specific differences are isolated here, not scattered in business logic.
 *  - Business code consumes canonical roles, never raw IdP claims directly.
 *  - Adding a new IdP (Okta, PingIdentity, etc.) only requires a new entry here
 *    plus a new adapter in idpAdapters/.
 *
 * Role mapping rule shape:
 * {
 *   attribute:         string   — which claim to read from the IdP token
 *   providerValues:    string[] — values that grant the 'provider' role in DecentraLabs
 *   adminValues:       string[] — values that grant the 'admin' role
 *   caseInsensitive:   boolean  — whether comparison is case-insensitive (default: true)
 *   substringMatch:    boolean  — whether partial match is enough (default: false)
 * }
 *
 * An IdP entry with no roleMapping means no IdP-level roles are granted;
 * the user will be authenticated but have no elevated permissions.
 */

// ─── Role mapping rule defaults ──────────────────────────────────────────────

const DEFAULT_RULE_OPTIONS = {
  caseInsensitive: true,
  substringMatch: false,
}

// ─── Registry ────────────────────────────────────────────────────────────────

/**
 * The IdP registry.
 *
 * Entries are loaded from environment variables so they can be overridden
 * per deployment without code changes. For a production system, this could
 * be migrated to a database table; the lookup API below would remain the same.
 *
 * @type {Array<IdPRegistryEntry>}
 */
function buildRegistry() {
  const entries = []

  // ── Microsoft Entra ID ────────────────────────────────────────────────────
  const entraTenantId = process.env.ENTRA_TENANT_ID
  if (entraTenantId && entraTenantId !== 'common') {
    entries.push({
      id: 'entra-default',
      provider: 'entra',
      type: 'oidc',
      tenantId: entraTenantId,
      discoveryUrl: `https://login.microsoftonline.com/${entraTenantId}/v2.0`,
      /**
       * Role mapping for Entra ID.
       *
       * By default we read the `roles` claim (App Roles configured in the
       * Azure App Registration). The values below match exactly what is
       * assigned in the Azure portal.
       *
       * Future customization: an institution can override `attribute` to
       * read `jobTitle`, `department`, `groups`, etc., and adjust
       * `providerValues` to match their own naming conventions.
       */
      roleMapping: {
        attribute: 'roles',
        providerValues: (process.env.ENTRA_PROVIDER_ROLE_VALUES || 'provider').split(',').map(v => v.trim()).filter(Boolean),
        adminValues: (process.env.ENTRA_ADMIN_ROLE_VALUES || 'admin').split(',').map(v => v.trim()).filter(Boolean),
        ...DEFAULT_RULE_OPTIONS,
      },
    })
  }

  // ── Okta ─────────────────────────────────────────────────────────────────
  // TODO (Phase 2): Populate from OKTA_* env vars when Okta integration is
  // implemented. The adapter in idpAdapters/oktaAdapter.js will handle the
  // claim translation; the role mapping rules belong here.
  //
  // Example entry (do not uncomment until Okta is configured):
  // if (process.env.OKTA_DOMAIN) {
  //   entries.push({
  //     id: 'okta-default',
  //     provider: 'okta',
  //     type: 'oidc',
  //     tenantId: process.env.OKTA_DOMAIN,
  //     discoveryUrl: `https://${process.env.OKTA_DOMAIN}/oauth2/default`,
  //     roleMapping: {
  //       attribute: 'groups',
  //       providerValues: (process.env.OKTA_PROVIDER_GROUP_VALUES || '').split(',').map(v => v.trim()).filter(Boolean),
  //       adminValues: (process.env.OKTA_ADMIN_GROUP_VALUES || '').split(',').map(v => v.trim()).filter(Boolean),
  //       ...DEFAULT_RULE_OPTIONS,
  //     },
  //   })
  // }

  return entries
}

// ─── Lookup API ──────────────────────────────────────────────────────────────

let _registry = null

/**
 * Returns the full IdP registry, lazily built once per process.
 * In tests, call resetRegistry() to force a rebuild with new env vars.
 *
 * @returns {Array<IdPRegistryEntry>}
 */
export function getRegistry() {
  if (!_registry) {
    _registry = buildRegistry()
  }
  return _registry
}

/**
 * Force a registry rebuild (useful in tests that mutate process.env).
 */
export function resetRegistry() {
  _registry = null
}

/**
 * Find a registry entry by IdP provider name and optional tenantId.
 *
 * @param {string} provider — 'entra' | 'okta'
 * @param {string} [tenantId] — optional tenant/org identifier for disambiguation
 * @returns {IdPRegistryEntry|null}
 */
export function findIdPByProvider(provider, tenantId) {
  const registry = getRegistry()
  return registry.find(entry => {
    if (entry.provider !== provider) return false
    if (tenantId && entry.tenantId !== tenantId) return false
    return true
  }) ?? null
}

/**
 * Find a registry entry by tenant ID alone.
 * Useful in the callback handler where we know the `tid` from the token.
 *
 * @param {string} tenantId
 * @returns {IdPRegistryEntry|null}
 */
export function findIdPByTenantId(tenantId) {
  const registry = getRegistry()
  return registry.find(entry => entry.tenantId === tenantId) ?? null
}

/**
 * Returns the role mapping rules for a given provider/tenant combination.
 * Returns null if no entry is found or if no roleMapping is configured.
 *
 * @param {string} provider
 * @param {string} [tenantId]
 * @returns {RoleMappingRule|null}
 */
export function getRoleMappingRules(provider, tenantId) {
  const entry = findIdPByProvider(provider, tenantId)
  return entry?.roleMapping ?? null
}

/**
 * @typedef {Object} RoleMappingRule
 * @property {string}   attribute        — claim name to read from the token
 * @property {string[]} providerValues   — values that grant 'provider' role
 * @property {string[]} adminValues      — values that grant 'admin' role
 * @property {boolean}  caseInsensitive  — case-insensitive comparison
 * @property {boolean}  substringMatch   — allow partial value match
 */

/**
 * @typedef {Object} IdPRegistryEntry
 * @property {string}           id
 * @property {'entra'|'okta'}   provider
 * @property {'oidc'|'saml'}    type
 * @property {string}           tenantId
 * @property {string}           discoveryUrl
 * @property {RoleMappingRule}  [roleMapping]
 */
