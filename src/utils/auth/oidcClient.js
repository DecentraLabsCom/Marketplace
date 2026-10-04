import { createHash, randomBytes } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const discoveryCache = new Map()
const jwksCache = new Map()
const OIDC_REQUEST_TIMEOUT_MS = 10_000

function requireServerValue(name) {
  const value = String(process.env[name] || '').trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64url')
}

function randomBase64Url(bytes = 32) {
  return encodeBase64Url(randomBytes(bytes))
}

function createAbortSignal() {
  return AbortSignal.timeout(OIDC_REQUEST_TIMEOUT_MS)
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: createAbortSignal() })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`OIDC provider returned ${response.status}`)
  }
  return payload
}

function assertHttpsEndpoint(value, field) {
  let parsed
  try {
    parsed = new URL(value)
  } catch (error) {
    throw new Error(`Invalid OIDC ${field}`, { cause: error })
  }
  if (parsed.protocol !== 'https:') throw new Error(`OIDC ${field} must use HTTPS`)
  return parsed.toString()
}

export function getEntraTenant() {
  return String(process.env.ENTRA_TENANT_ID || '').trim() || 'common'
}

export function getEntraRedirectUri(origin) {
  const configured = String(process.env.ENTRA_REDIRECT_URI || '').trim()
  if (configured) return configured
  const baseUrl = String(process.env.NEXT_PUBLIC_APP_URL || origin || '').replace(/\/$/, '')
  if (!baseUrl) throw new Error('NEXT_PUBLIC_APP_URL is not configured')
  return `${baseUrl}/api/auth/entra/callback`
}

export async function getEntraOidcConfig() {
  const tenant = getEntraTenant()
  const cached = discoveryCache.get(tenant)
  if (cached) return cached

  const issuer = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/v2.0`
  const discoveryUrl = `${issuer}/.well-known/openid-configuration`
  const metadata = await fetchJson(discoveryUrl)
  const config = {
    tenant,
    issuer: String(metadata.issuer || issuer).replace(/\/$/, ''),
    authorizationEndpoint: assertHttpsEndpoint(metadata.authorization_endpoint, 'authorization endpoint'),
    tokenEndpoint: assertHttpsEndpoint(metadata.token_endpoint, 'token endpoint'),
    jwksUri: assertHttpsEndpoint(metadata.jwks_uri, 'JWKS URI'),
    clientId: requireServerValue('ENTRA_CLIENT_ID'),
    clientSecret: requireServerValue('ENTRA_CLIENT_SECRET'),
  }
  discoveryCache.set(tenant, config)
  return config
}

export function createOidcTransaction() {
  const codeVerifier = randomBase64Url(48)
  const codeChallenge = encodeBase64Url(createHash('sha256').update(codeVerifier).digest())
  return {
    state: randomBase64Url(),
    nonce: randomBase64Url(),
    codeVerifier,
    codeChallenge,
  }
}

export function buildEntraAuthorizationUrl(config, transaction) {
  const url = new URL(config.authorizationEndpoint)
  url.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    response_mode: 'query',
    redirect_uri: transaction.redirectUri,
    scope: 'openid profile email',
    state: transaction.state,
    nonce: transaction.nonce,
    code_challenge: transaction.codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString()
  return url
}

export async function exchangeEntraCode(config, { code, codeVerifier, redirectUri }) {
  const payload = await fetchJson(config.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  })
  if (typeof payload.id_token !== 'string' || !payload.id_token.trim()) {
    throw new Error('Entra token response did not include an ID token')
  }
  return payload.id_token
}

function isExpectedEntraIssuer(issuer, claims, config) {
  if (typeof issuer !== 'string' || typeof claims?.tid !== 'string') return false
  const tenantIssuer = `https://login.microsoftonline.com/${claims.tid}/v2.0`
  if (config.tenant === 'common' || config.tenant === 'organizations') return issuer === tenantIssuer
  return issuer === config.issuer && issuer === tenantIssuer
}

export async function verifyEntraIdToken(config, idToken, nonce) {
  let remoteJwks = jwksCache.get(config.jwksUri)
  if (!remoteJwks) {
    remoteJwks = createRemoteJWKSet(new URL(config.jwksUri))
    jwksCache.set(config.jwksUri, remoteJwks)
  }

  const { payload } = await jwtVerify(idToken, remoteJwks, {
    algorithms: ['RS256'],
    audience: config.clientId,
    clockTolerance: 60,
  })
  if (!isExpectedEntraIssuer(payload.iss, payload, config)) {
    throw new Error('Entra issuer is not trusted')
  }
  if (typeof payload.nonce !== 'string' || payload.nonce !== nonce) {
    throw new Error('Entra nonce mismatch')
  }
  if (typeof payload.tid !== 'string' || typeof payload.oid !== 'string' || typeof payload.sub !== 'string') {
    throw new Error('Entra ID token is missing required identity claims')
  }
  return payload
}

export function clearOidcTransactionCookies(response) {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  }
  for (const name of ['entra_oidc_state', 'entra_oidc_nonce', 'entra_oidc_verifier']) {
    response.cookies.set(name, '', cookieOptions)
  }
}

export function safePostLoginRedirect(value) {
  const configured = String(value || '/').trim()
  if (!configured.startsWith('/') || configured.startsWith('//')) return '/'
  return configured
}

export default {
  getEntraOidcConfig,
  getEntraRedirectUri,
  createOidcTransaction,
  buildEntraAuthorizationUrl,
  exchangeEntraCode,
  verifyEntraIdToken,
  clearOidcTransactionCookies,
  safePostLoginRedirect,
}
