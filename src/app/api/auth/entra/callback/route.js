/**
 * GET /api/auth/entra/callback
 *
 * OAuth 2.0 / OIDC Authorization Code callback for Microsoft Entra ID (openid-client v6).
 *
 * Flow:
 *  1. Validates the CSRF `state` cookie against the query param.
 *  2. Exchanges the `code` for tokens using PKCE via authorizationCodeGrant().
 *  3. openid-client v6 validates id_token automatically (sig, iss, aud, exp).
 *  4. Maps Entra claims → CanonicalPrincipal (entraIdAdapter).
 *  5. Emits the DecentraLabs local JWT for blockchain-services (marketplaceJwt).
 *  6. Creates the session cookie (same pattern as SAML callback).
 *  7. Redirects to the post-login destination.
 *
 * The external Entra tokens are discarded after step 4 — they never leave this handler.
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getOidcConfig, exchangeCode } from '@/utils/auth/oidcClient'
import { buildCanonicalPrincipalFromEntra, principalToSessionData } from '@/utils/auth/entraIdAdapter'
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'
import { createSessionCookie } from '@/utils/auth/sessionCookie'
import devLog from '@/utils/dev/logger'

const POST_LOGIN_REDIRECT = process.env.ENTRA_POST_LOGIN_REDIRECT || '/'
const PKCE_COOKIE_CLEAR_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 0,
}

function clearPkceAndRedirect(baseUrl, destination) {
  // Use root '/' if it's pointing to non-existent /login
  const target = destination.startsWith('/login') ? destination.replace('/login', '/') : destination
  const res = NextResponse.redirect(new URL(target, baseUrl))
  res.cookies.set('entra_code_verifier', '', PKCE_COOKIE_CLEAR_OPTIONS)
  res.cookies.set('entra_state', '', PKCE_COOKIE_CLEAR_OPTIONS)
  res.cookies.set('entra_tenant', '', PKCE_COOKIE_CLEAR_OPTIONS)
  return res
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const stateFromQuery = searchParams.get('state')
  const errorParam = searchParams.get('error')

  // ── Handle IdP-side errors ──────────────────────────────────────────────────
  if (errorParam) {
    const description = searchParams.get('error_description') || errorParam
    devLog.warn('[ENTRA] IdP returned error:', errorParam, description)
    return clearPkceAndRedirect(
      req.url,
      `/login?error=entra_idp_error&reason=${encodeURIComponent(description)}`
    )
  }

  if (!searchParams.get('code')) {
    devLog.warn('[ENTRA] Callback called without authorization code')
    return clearPkceAndRedirect(req.url, '/login?error=missing_code')
  }

  // ── Read PKCE / CSRF cookies ───────────────────────────────────────────────
  const cookieStore = await cookies()
  const codeVerifier = cookieStore.get('entra_code_verifier')?.value
  const stateFromCookie = cookieStore.get('entra_state')?.value
  const customTenantId = cookieStore.get('entra_tenant')?.value

  if (!codeVerifier || !stateFromCookie) {
    devLog.warn('[ENTRA] Missing PKCE verifier or state cookie')
    return clearPkceAndRedirect(req.url, '/login?error=auth_failed')
  }

  // ── CSRF state validation ──────────────────────────────────────────────────
  if (stateFromQuery !== stateFromCookie) {
    devLog.warn('[ENTRA] State mismatch — possible CSRF attempt')
    return clearPkceAndRedirect(req.url, '/login?error=auth_failed')
  }

  try {
    // ── Token exchange (openid-client v6) ──────────────────────────────────
    const config = await getOidcConfig('entra', customTenantId)

    // authorizationCodeGrant parses the full callback URL + validates id_token
    const tokens = await exchangeCode(config, req.url, {
      codeVerifier,
      state: stateFromCookie,
    })

    const claims = tokens.claims()

    devLog.log('[ENTRA] Token exchange successful, tid:', claims.tid, 'oid:', claims.oid?.slice(0, 8) + '…')

    // ── Claims → CanonicalPrincipal ────────────────────────────────────────
    const principal = buildCanonicalPrincipalFromEntra(claims)

    // ── Validate local JWT generation chain (optional in dev) ────────────
    try {
      await marketplaceJwtService.generateEntraAuthToken(principal)
    } catch (e) {
      devLog.warn('[ENTRA] Operational JWT generation skipped (key missing):', e.message)
    }

    // ── Build session data ─────────────────────────────────────────────────
    const sessionData = principalToSessionData(principal)

    // ── Create session cookie and redirect ─────────────────────────────────
    const successResponse = NextResponse.redirect(new URL(POST_LOGIN_REDIRECT, req.url))

    // Clear PKCE cookies
    successResponse.cookies.set('entra_code_verifier', '', PKCE_COOKIE_CLEAR_OPTIONS)
    successResponse.cookies.set('entra_state', '', PKCE_COOKIE_CLEAR_OPTIONS)
    successResponse.cookies.set('entra_tenant', '', PKCE_COOKIE_CLEAR_OPTIONS)

    // Write session cookie(s) — handles chunking automatically
    const cookieConfigs = createSessionCookie(sessionData)
    const configs = Array.isArray(cookieConfigs) ? cookieConfigs : [cookieConfigs]
    configs.forEach(({ name, value, ...opts }) => {
      successResponse.cookies.set(name, value, opts)
    })

    devLog.log('[ENTRA] Session created for principal:', principal.sub)
    return successResponse

  } catch (error) {
    devLog.error('[ENTRA] Callback processing failed:', error.message)
    return clearPkceAndRedirect(req.url, '/login?error=auth_failed')
  }
}
