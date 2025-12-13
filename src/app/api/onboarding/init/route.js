/**
 * API Route: POST /api/onboarding/init
 * 
 * Initiates the institutional onboarding process for an SSO user.
 * This endpoint:
 * 1. Validates the user has an active SSO session
 * 2. Checks if the user's institution has a configured gateway
 * 3. Calls the Institutional Backend to start WebAuthn registration
 * 4. Returns the ceremony URL for the browser to redirect to
 * 
 * @module app/api/onboarding/init
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSessionFromCookies } from '@/utils/auth/sessionCookie'
import { 
  initiateInstitutionalOnboarding, 
  checkUserOnboardingStatus,
  OnboardingErrorCode 
} from '@/utils/onboarding'
import devLog from '@/utils/dev/logger'

/**
 * POST /api/onboarding/init
 * Initiates institutional WebAuthn onboarding for the current SSO user
 * 
 * @param {Request} request - HTTP request
 * @returns {Response} JSON with sessionId and ceremonyUrl, or error
 */
export async function POST(request) {
  try {
    // Step 1: Get user session
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
        { 
          error: 'Missing institution affiliation in session',
          code: OnboardingErrorCode.MISSING_USER_DATA 
        },
        { status: 400 }
      )
    }

    devLog.log('[Onboarding/Init] Starting onboarding for:', userData.email, 'institution:', userData.affiliation)

    // Step 2: Check if user is already onboarded (optional - IB endpoint may not exist)
    const existingStatus = await checkUserOnboardingStatus({ userData })
    
    if (existingStatus.isOnboarded) {
      devLog.log('[Onboarding/Init] User already onboarded')
      return NextResponse.json({
        status: 'already_onboarded',
        isOnboarded: true,
        stableUserId: existingStatus.stableUserId,
        institutionId: existingStatus.institutionId,
      })
    }

    // Step 3: Build callback URL for IB to notify us when complete
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin
    const callbackUrl = `${baseUrl}/api/onboarding/callback`

    // Step 4: Initiate onboarding with IB
    const onboardingSession = await initiateInstitutionalOnboarding({
      userData,
      callbackUrl,
    })

    devLog.log('[Onboarding/Init] Session created:', onboardingSession.sessionId)

    return NextResponse.json({
      status: 'initiated',
      sessionId: onboardingSession.sessionId,
      ceremonyUrl: onboardingSession.ceremonyUrl,
      gatewayUrl: onboardingSession.gatewayUrl,
      stableUserId: onboardingSession.stableUserId,
      institutionId: onboardingSession.institutionId,
      expiresAt: onboardingSession.expiresAt,
    })

  } catch (error) {
    devLog.error('[Onboarding/Init] Error:', error)

    // Handle known error codes
    if (error.message?.includes(OnboardingErrorCode.NO_GATEWAY)) {
      return NextResponse.json(
        { 
          error: 'Your institution has not configured an institutional backend',
          code: OnboardingErrorCode.NO_GATEWAY,
        },
        { status: 400 }
      )
    }

    if (error.message?.includes(OnboardingErrorCode.GATEWAY_UNREACHABLE)) {
      return NextResponse.json(
        { 
          error: 'Could not reach institutional backend',
          code: OnboardingErrorCode.GATEWAY_UNREACHABLE,
          details: error.message,
        },
        { status: 502 }
      )
    }

    return NextResponse.json(
      { 
        error: 'Failed to initiate onboarding',
        details: error.message,
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/onboarding/init
 * Returns onboarding status for the current user
 */
export async function GET() {
  try {
    const cookieStore = await cookies()
    const session = getSessionFromCookies(cookieStore)
    
    if (!session || !session.isSSO) {
      return NextResponse.json(
        { error: 'SSO session required' },
        { status: 401 }
      )
    }

    const userData = {
      id: session.id || session.uid,
      email: session.email,
      affiliation: session.affiliation || session.schacHomeOrganization,
      personalUniqueCode: session.personalUniqueCode || session.schacPersonalUniqueCode,
      scopedRole: session.scopedRole || session.eduPersonScopedAffiliation,
    }

    const status = await checkUserOnboardingStatus({ userData })

    return NextResponse.json({
      ...status,
      hasGateway: !status.error?.includes(OnboardingErrorCode.NO_GATEWAY),
    })

  } catch (error) {
    devLog.error('[Onboarding/Init] GET Error:', error)
    return NextResponse.json(
      { error: 'Failed to check onboarding status' },
      { status: 500 }
    )
  }
}
