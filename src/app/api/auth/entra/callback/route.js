import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSession } from '@/utils/auth/sso'
import { buildIdentityEvidence } from '@/utils/auth/identityEvidence'
import {
  clearOidcTransactionCookies,
  exchangeEntraCode,
  getEntraOidcConfig,
  getEntraRedirectUri,
  safePostLoginRedirect,
  verifyEntraIdToken,
} from '@/utils/auth/oidcClient'
import { consumeOidcTransaction } from '@/utils/auth/oidcTransactionStore'
import {
  buildCanonicalPrincipalFromEntra,
  principalToSessionData,
} from '@/utils/auth/entraIdAdapter'
import { resolveInstitutionalBackendUrl } from '@/utils/onboarding/institutionalBackend'
import { createInstitutionalIdentitySession } from '@/utils/auth/institutionalSessionClient'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'
import devLog from '@/utils/dev/logger'

const checkRate = createRateLimiter({ operation: 'auth-entra-callback', windowMs: 60_000, maxRequests: 10 })

function redirectWithError(request, code) {
  const response = NextResponse.redirect(new URL(`/login?error=${code}`, request.url), 303)
  clearOidcTransactionCookies(response)
  return response
}

export async function GET(request) {
  const rateLimitResponse = createRateLimitResponse(await checkRate(request), 'Too many Entra callback attempts')
  if (rateLimitResponse) {
    rateLimitResponse.headers.set('Cache-Control', 'no-store')
    return rateLimitResponse
  }
  const params = request.nextUrl.searchParams
  if (params.get('error')) return redirectWithError(request, 'entra_idp_error')

  const code = params.get('code')
  const state = params.get('state')
  const cookieStore = await cookies()
  const expectedState = cookieStore.get('entra_oidc_state')?.value
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithError(request, 'entra_auth_failed')
  }

  try {
    const transaction = await consumeOidcTransaction(state, 'entra-id')
    if (!transaction) return redirectWithError(request, 'entra_auth_failed')
    const config = await getEntraOidcConfig()
    const redirectUri = getEntraRedirectUri(request.nextUrl.origin)
    if (redirectUri !== transaction.redirectUri) return redirectWithError(request, 'entra_auth_failed')
    const idToken = await exchangeEntraCode(config, {
      code,
      codeVerifier: transaction.codeVerifier,
      redirectUri: transaction.redirectUri,
    })
    const claims = await verifyEntraIdToken(config, idToken, transaction.nonce)
    const principal = buildCanonicalPrincipalFromEntra(claims)
    const evidence = buildIdentityEvidence({
      protocol: 'oidc',
      provider: 'entra-id',
      issuer: principal.externalIssuer,
      subject: principal.externalSubject,
      stableUserId: principal.sub,
      institutionId: principal.institutionId,
      rawEvidence: idToken,
      issuedAt: claims.iat ? new Date(Number(claims.iat) * 1000).toISOString() : undefined,
      expiresAt: claims.exp ? new Date(Number(claims.exp) * 1000).toISOString() : undefined,
    })

    const backendUrl = await resolveInstitutionalBackendUrl(principal.institutionId)
    if (!backendUrl) throw new Error('Institutional backend is not configured')
    const institutionalSession = await createInstitutionalIdentitySession({
      backendUrl,
      institutionId: principal.institutionId,
      stableUserIdMode: 'oidc-issuer-sub-v1',
      identityEvidence: evidence,
      puc: principal.sub,
      externalIdToken: idToken,
      identityNonce: transaction.nonce,
    })
    const sessionData = {
      ...principalToSessionData(principal, evidence),
      stableUserIdMode: 'oidc-issuer-sub-v1',
      ...institutionalSession,
    }

    const response = NextResponse.redirect(
      new URL(safePostLoginRedirect(process.env.ENTRA_POST_LOGIN_REDIRECT), request.url),
      303,
    )
    clearOidcTransactionCookies(response)
    response.headers.set('Cache-Control', 'no-store')
    await createSession(response, sessionData)
    return response
  } catch (error) {
    devLog.warn('[ENTRA] OIDC callback rejected', error?.message || error)
    return redirectWithError(request, 'entra_auth_failed')
  }
}
