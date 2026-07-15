/**
 * API Route: GET /api/onboarding/status/[sessionId]
 * 
 * Checks the local callback cache for onboarding session status.
 * The browser makes direct calls to the IB for status checks (to bypass firewall),
 * this endpoint only checks if we've received a callback from the IB.
 * 
 * @module app/api/onboarding/status/[sessionId]
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSessionFromCookies } from '@/utils/auth/sessionCookie'
import { getOnboardingResult } from '@/utils/onboarding'
import devLog from '@/utils/dev/logger'
import { publicErrorResponse, sanitizeErrorForLog } from '@/utils/security/publicError'
import { toPublicOnboardingResult } from '@/utils/onboarding/publicResult'

/**
 * GET /api/onboarding/status/[sessionId]
 * Checks onboarding session status from local callback cache
 * 
 * Query params:
 * - checkLocal: Must be "true" (maintained for compatibility)
 * 
 * @param {Request} request - HTTP request
 * @param {Object} context - Route context with params
 * @returns {Response} Session status from callback cache
 */
export async function GET(request, { params }) {
  try {
    const { sessionId } = await params

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing sessionId parameter' },
        { status: 400 }
      )
    }

    // Verify user has SSO session
    const cookieStore = await cookies()
    const session = await getSessionFromCookies(cookieStore)
    if (!session || !session.isSSO) {
      return NextResponse.json(
        { error: 'SSO session required' },
        { status: 401 }
      )
    }

    devLog.log('[Onboarding/Status] Checking local cache for session:', sessionId)

    // Check local callback cache
    const localResult = getOnboardingResult(`session:${sessionId}`)
    if (localResult) {
      devLog.log('[Onboarding/Status] Found result in local cache')
      return NextResponse.json(toPublicOnboardingResult(localResult, 'callback'))
    }

    // No callback received yet - browser should check IB directly
    return NextResponse.json({
      sessionId,
      status: 'PENDING',
      source: 'local',
      message: 'No callback received yet',
    })

  } catch (error) {
    devLog.error('[Onboarding/Status] Error:', sanitizeErrorForLog(error))
    return publicErrorResponse({
      status: 500,
      code: 'ONBOARDING_STATUS_FAILED',
      message: 'The onboarding status could not be checked.',
      error,
      context: 'onboarding-status',
    })
  }
}
