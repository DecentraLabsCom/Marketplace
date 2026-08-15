/**
 * API endpoint for initiating SAML2 SSO login process
 * Handles GET requests to redirect users to SSO identity provider
 */
import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { createServiceProvider, createIdentityProvider } from '@/utils/auth/sso'
import {
  createSamlLoginTransaction,
  normalizeSamlReturnTo,
} from '@/utils/auth/samlTransactionStore'

/**
 * Initiates SAML2 SSO login by redirecting to identity provider
 * @returns {Response} Redirect response to SSO login URL or error
 */
export async function GET(request) {
  try {
    const returnTo = normalizeSamlReturnTo(new URL(request.url).searchParams.get('returnTo'))
    const sp = createServiceProvider()
    const idp = await createIdentityProvider()
    const relayState = randomBytes(32).toString('base64url')

    return await new Promise((resolve) => {
      sp.create_login_request_url(idp, {
        relay_state: relayState,
        force_authn: false,
      }, async (error, loginUrl, requestId) => {
        if (error || !loginUrl || !requestId) {
          resolve(new NextResponse('Failed to create SSO login URL', { status: 500 }))
          return
        }
        try {
          const transaction = { requestId, relayState }
          if (returnTo) transaction.returnTo = returnTo
          await createSamlLoginTransaction(transaction)
          resolve(NextResponse.redirect(loginUrl))
        } catch {
          resolve(NextResponse.json({ error: 'SSO is temporarily unavailable' }, { status: 503 }))
        }
      })
    })
  } catch {
    return NextResponse.json({ error: 'SSO is temporarily unavailable' }, { status: 503 })
  }
}
