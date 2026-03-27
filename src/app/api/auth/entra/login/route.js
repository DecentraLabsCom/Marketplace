/**
 * GET /api/auth/entra/login
 *
 * Initiates the Microsoft Entra ID Authorization Code + PKCE flow (openid-client v6).
 * Stores the PKCE code_verifier and CSRF state in short-lived httpOnly cookies,
 * then redirects the user to the Entra ID authorization endpoint.
 */

import { NextResponse } from 'next/server'
import { getOidcConfig, generatePkceParams, buildEntraAuthUrl, getRedirectUri } from '@/utils/auth/oidcClient'
import devLog from '@/utils/dev/logger'

const PKCE_COOKIE_MAX_AGE = 5 * 60 // 5 minutes

export async function GET() {
  try {
    const config = await getOidcConfig('entra')
    const redirectUri = getRedirectUri('entra')
    const { codeVerifier, state } = generatePkceParams()

    const authorizationUrl = await buildEntraAuthUrl(config, codeVerifier, redirectUri, state)

    devLog.log('[ENTRA] Redirecting to authorization URL, state:', state.slice(0, 8) + '…')

    const response = NextResponse.redirect(authorizationUrl.href)

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: PKCE_COOKIE_MAX_AGE,
    }

    response.cookies.set('entra_code_verifier', codeVerifier, cookieOptions)
    response.cookies.set('entra_state', state, cookieOptions)

    return response
  } catch (error) {
    devLog.error('[ENTRA] Failed to initiate login:', error.message)
    return NextResponse.json(
      { error: 'Failed to initiate Entra ID login. Check server configuration.' },
      { status: 500 }
    )
  }
}
