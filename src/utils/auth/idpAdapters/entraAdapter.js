/**
 * Entra ID Adapter — idpAdapters wrapper
 *
 * This file is the canonical location for the Entra ID adapter within the
 * idpAdapters/ directory structure. It re-exports from the original
 * entraIdAdapter.js to maintain backward compatibility with all existing
 * imports throughout the codebase.
 *
 * Migration path:
 *  - Phase 1 (now): Existing code imports from '@/utils/auth/entraIdAdapter'
 *    directly. That file still works unchanged.
 *  - Phase 2 (future): New code that uses getAdapterForProvider() from
 *    idpAdapters/index.js will reach this file automatically.
 *
 * When implementing Okta, follow the same pattern:
 *  1. Create the full adapter logic in oktaAdapter.js (this file, not a wrapper)
 *  2. Register it in idpAdapters/index.js
 *  3. Create src/utils/auth/oktaAdapter.js as a re-export for direct imports
 */

export {
  buildCanonicalPrincipalFromEntra as buildCanonicalPrincipal,
  principalToSessionData,
} from '../entraIdAdapter.js'

/**
 * Provider identifier — must match AuthMethod.ENTRA from principal.js
 * and the 'provider' field in idpRegistry.js entries.
 */
export const PROVIDER_ID = 'entra'
