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

/**
 * GET /api/onboarding/session
 * Returns session data needed for browser-direct IB onboarding
 * 
 * @returns {Response} JSON with user data for IB onboarding
 */
export async function GET() {
  try {
    const cookieStore = await cookies()
    const session = getSessionFromCookies(cookieStore)
    
    if (!session || !session.isSSO) {
      return NextResponse.json(
        { error: 'SSO session required for institutional onboarding' },
        { status: 401 }
      )
    }

    const userData = {
      id: session.id || session.uid,
      email: session.email,
      name: session.name || session.displayName,
      affiliation: session.affiliation || session.schacHomeOrganization,
      role: session.role || session.eduPersonAffiliation,
      scopedRole: session.scopedRole || session.eduPersonScopedAffiliation,
      personalUniqueCode: session.personalUniqueCode || session.schacPersonalUniqueCode,
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
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://decentralabs.io'
    const callbackUrl = `${baseUrl}/api/onboarding/callback`

    // Build the response payload (same structure as what server would send to IB)
    const payload = {
      stableUserId,
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

    devLog.log('[Onboarding/Session] Returning session data for:', stableUserId)

    return NextResponse.json({
      status: 'ok',
      payload,
      // Also return some metadata for the browser
      meta: {
        stableUserId,
        institutionId: userData.affiliation,
        email: userData.email,
        displayName: payload.displayName,
      },
    })

  } catch (error) {
    devLog.error('[Onboarding/Session] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get session data', details: error.message },
      { status: 500 }
    )
  }
}
