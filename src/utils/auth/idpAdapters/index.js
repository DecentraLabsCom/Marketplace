/**
 * IdP Adapters Index — DecentraLabs
 *
 * Central export point for all Identity Provider adapters.
 *
 * This module allows the rest of the application (like oidcClient.js or
 * auth callback routes) to resolve the correct adapter dynamically based
 * on the provider name ('entra', 'okta', etc.), without needing to
 * hardcode imports for every possible IdP.
 */

import * as entraAdapter from './entraAdapter.js'
import * as oktaAdapter from './oktaAdapter.js'

/**
 * Registry of active adapters mapped by their PROVIDER_ID.
 */
const adapters = {
  [entraAdapter.PROVIDER_ID]: entraAdapter,
  // Note: oktaAdapter throws errors if called, but it's registered here
  // so the architecture is fully in place for Phase 2.
  [oktaAdapter.PROVIDER_ID]: oktaAdapter,
}

/**
 * Get the adapter module for a specific Identity Provider.
 *
 * @param {string} providerName — e.g. 'entra', 'okta'
 * @returns {Object} The adapter module (must implement buildCanonicalPrincipal and principalToSessionData)
 * @throws {Error} If the provider is unknown or no adapter is registered
 */
export function getAdapterForProvider(providerName) {
  const adapter = adapters[providerName]
  if (!adapter) {
    throw new Error(`[idpAdapters] No adapter registered for provider: '${providerName}'`)
  }
  return adapter
}
