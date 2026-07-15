/**
 * API Route: GET /api/onboarding/session
 * 
 * Returns the user's session data needed for browser-direct IB calls.
 * This is a lightweight endpoint that doesn't make any external calls -
 * it just extracts and returns the session data for the browser to use
 * when calling the Institutional Backend directly.
 * 
 * This approach bypasses firewall restrictions that may block server-to-server
 * calls from Vercel to institutional backends.
 * 
 * @module app/api/onboarding/session
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSessionFromCookies } from '@/utils/auth/sessionCookie'
import { extractStableUserId } from '@/utils/onboarding'
import { computeAssertionHash } from '@/utils/intents/signInstitutionalActionIntent'
import devLog from '@/utils/dev/logger'
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'
import { buildSignedOnboardingCallbackUrl } from '@/utils/onboarding/callbackAuth'
import { resolveInstitutionDomainFromSession } from '@/utils/auth/institutionDomain'
import { getStableUserIdModeFromSession } from '@/utils/auth/puc'
import { publicErrorResponse } from '@/utils/security/publicError'
import { getBaseUrl } from '@/utils/env/baseUrl'

/**
 * GET /api/onboarding/session
 * Returns session data needed for browser-direct IB onboarding
 * 
 * @returns {Response} JSON with user data for IB onboarding
 */
export async function GET() {
  try {
    const cookieStore = await cookies()
  const session = await getSessionFromCookies(cookieStore)
    
    if (!session || !session.isSSO) {
      return NextResponse.json(
        { error: 'SSO session required for institutional onboarding' },
        { status: 401 }
      )
    }

    const userData = {
      eduPersonPrincipalName: session.eduPersonPrincipalName,
      eduPersonTargetedID: session.eduPersonTargetedID,
      email: session.email,
      name: session.name || session.displayName,
      affiliation: resolveInstitutionDomainFromSession(session),
      role: session.role,
      scopedRole: session.scopedRole || session.eduPersonScopedAffiliation,
      samlAssertion: session.samlAssertion,
    }

    if (!userData.affiliation) {
      return NextResponse.json(
        { error: 'Missing institution affiliation in session' },
        { status: 400 }
      )
    }

    // Extract stable user ID (same logic as server-side onboarding)
    const stableUserId = extractStableUserId(userData)
    if (!stableUserId) {
      return NextResponse.json(
        { error: 'Cannot determine stable user ID from session' },
        { status: 400 }
      )
    }

    // Build the callback URL for the IB
    const baseUrl = getBaseUrl()
    const unsignedCallbackUrl = `${baseUrl}/api/onboarding/callback`
    const callbackUrl = buildSignedOnboardingCallbackUrl(unsignedCallbackUrl, {
      stableUserId,
      institutionId: userData.affiliation,
    })

    // Build the response payload (same structure as what server would send to IB)
    const payload = {
      stableUserId,
      stableUserIdMode: getStableUserIdModeFromSession(session),
      institutionId: userData.affiliation,
      displayName: userData.name || userData.email || stableUserId,
      attributes: JSON.stringify({
        email: userData.email,
        role: userData.role,
        scopedRole: userData.scopedRole,
      }),
      callbackUrl,
    }

    // Include assertion reference if available (hashed, not the full assertion)
    if (userData.samlAssertion) {
      payload.assertionReference = `sha256:${computeAssertionHash(userData.samlAssertion)}`
      // Note: We don't include the full samlAssertion in browser-direct calls
      // The IB can verify the user via the assertionReference if needed
    }

    const onboardingAuth = await marketplaceJwtService.generateIntentBackendToken({
      scope: 'onboarding:webauthn',
      expiresInSeconds: 15 * 60,
      subject: stableUserId,
      claims: {
        puc: stableUserId,
        affiliation: userData.affiliation,
      },
    })

    devLog.log('[Onboarding/Session] Returning session data for:', stableUserId)

    return NextResponse.json({
      status: 'ok',
      payload,
      auth: {
        backendAuthToken: onboardingAuth.token,
        expiresAt: onboardingAuth.expiresAt,
      },
      // Also return some metadata for the browser
      meta: {
        stableUserId,
        institutionId: userData.affiliation,
        backendAuthExpiresAt: onboardingAuth.expiresAt,
      },
    })

  } catch (error) {
    return publicErrorResponse({
      status: 500,
      code: 'ONBOARDING_SESSION_FAILED',
      message: 'The onboarding session could not be prepared.',
      error,
      context: 'onboarding-session',
    })
  }
}
