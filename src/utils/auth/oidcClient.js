/**
 * OIDC Client Factory — Microsoft Entra ID (+ future providers)
 *
 * Uses openid-client v6 API:
 * - discovery()               → fetches provider metadata
 * - Configuration             → client config object
 * - buildAuthorizationUrl()   → generates the authorization URL
 * - authorizationCodeGrant()  → exchanges the code for tokens
 * - random*                   → PKCE / state helpers
 *
 * References:
 *   - https://github.com/panva/node-openid-client (v6 docs)
 *   - PLAN_ENTRA_OKTA_M2M_SUPPORT.md § 5.1
 */

import {
  discovery,
  buildAuthorizationUrl,
  authorizationCodeGrant,
  calculatePKCECodeChallenge,
  randomPKCECodeVerifier,
  randomState,
} from 'openid-client'

// Per-provider server config cache
const configCache = new Map()

/**
 * Returns the discovery URL for a given provider ID.
 *
 * @param {'entra'} providerId
 * @returns {URL}
 */
function getIssuerUrl(providerId) {
  if (providerId === 'entra') {
    const tenant = process.env.ENTRA_TENANT_ID || 'common'
    return new URL(`https://login.microsoftonline.com/${tenant}/v2.0`)
  }
  throw new Error(`[OIDCClient] Unknown provider: ${providerId}`)
}

/**
 * Returns the registered redirect URI for a provider.
 *
 * @param {'entra'} providerId
 * @returns {string}
 */
export function getRedirectUri(providerId) {
  if (providerId === 'entra') {
    return (
      process.env.ENTRA_REDIRECT_URI ||
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/entra/callback`
    )
  }
  throw new Error(`[OIDCClient] Unknown provider: ${providerId}`)
}

/**
 * Returns a configured openid-client v6 server config for the given provider.
 * Performs OIDC discovery the first time and caches the result.
 *
 * @param {'entra'} providerId
 * @returns {Promise<import('openid-client').Configuration>}
 */
export async function getOidcConfig(providerId) {
  if (configCache.has(providerId)) {
    return configCache.get(providerId)
  }

  const clientId = process.env.ENTRA_CLIENT_ID
  const clientSecret = process.env.ENTRA_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('[OIDCClient] ENTRA_CLIENT_ID and ENTRA_CLIENT_SECRET must be set')
  }

  const issuerUrl = getIssuerUrl(providerId)
  const config = await discovery(issuerUrl, clientId, clientSecret)

  configCache.set(providerId, config)
  return config
}

// ─── PKCE Helpers ────────────────────────────────────────────────────────────

/**
 * Generates a PKCE code verifier + a random state value for CSRF protection.
 *
 * @returns {{ codeVerifier: string, state: string }}
 */
export function generatePkceParams() {
  return {
    codeVerifier: randomPKCECodeVerifier(),
    state: randomState(),
  }
}

/**
 * Builds the authorization URL with PKCE code challenge.
 *
 * @param {import('openid-client').Configuration} config - From getOidcConfig()
 * @param {string} codeVerifier - PKCE verifier from generatePkceParams()
 * @param {string} redirectUri  - Must match the registered redirect URI
 * @param {string} [state]      - Optional CSRF state value
 * @returns {Promise<URL>} Full authorization URL to redirect the user to
 */
export async function buildEntraAuthUrl(config, codeVerifier, redirectUri, state) {
  const codeChallenge = await calculatePKCECodeChallenge(codeVerifier)
  return buildAuthorizationUrl(config, {
    scope: 'openid profile email',
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state: state || undefined,
  })
}

/**
 * Exchanges the authorization code for tokens.
 * openid-client v6 validates id_token (sig, iss, aud, exp) automatically.
 *
 * @param {import('openid-client').Configuration} config
 * @param {URL|string} callbackUrl - Full URL of the callback request (including code, state)
 * @param {{ codeVerifier: string, state: string }} pkceParams
 * @returns {Promise<import('openid-client').TokenEndpointResponse>}
 */
export async function exchangeCode(config, callbackUrl, { codeVerifier, state }) {
  return authorizationCodeGrant(config, new URL(callbackUrl), {
    pkceCodeVerifier: codeVerifier,
    expectedState: state,
  })
}
