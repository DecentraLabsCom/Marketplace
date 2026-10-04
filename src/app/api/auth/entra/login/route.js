import { NextResponse } from 'next/server'
import {
  buildEntraAuthorizationUrl,
  createOidcTransaction,
  getEntraOidcConfig,
  getEntraRedirectUri,
} from '@/utils/auth/oidcClient'
import { saveOidcTransaction } from '@/utils/auth/oidcTransactionStore'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'
import devLog from '@/utils/dev/logger'

const TRANSACTION_MAX_AGE_SECONDS = 5 * 60
const checkRate = createRateLimiter({ operation: 'auth-entra-login', windowMs: 60_000, maxRequests: 10 })

export async function GET(request) {
  const rateLimitResponse = createRateLimitResponse(await checkRate(request), 'Too many Entra login attempts')
  if (rateLimitResponse) {
    rateLimitResponse.headers.set('Cache-Control', 'no-store')
    return rateLimitResponse
  }
  try {
    const config = await getEntraOidcConfig()
    const transaction = createOidcTransaction()
    const redirectUri = getEntraRedirectUri(request.nextUrl.origin)
    const authorizationUrl = buildEntraAuthorizationUrl(config, { ...transaction, redirectUri })
    await saveOidcTransaction({
      ...transaction,
      redirectUri,
      provider: 'entra-id',
    }, TRANSACTION_MAX_AGE_SECONDS)
    const response = NextResponse.redirect(authorizationUrl)
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: TRANSACTION_MAX_AGE_SECONDS,
    }
    response.cookies.set('entra_oidc_state', transaction.state, cookieOptions)
    response.headers.set('Cache-Control', 'no-store')
    return response
  } catch (error) {
    devLog.error('[ENTRA] OIDC login initiation failed', error?.message || error)
    return NextResponse.json({ error: 'Entra ID login is not configured' }, { status: 503 })
  }
}
