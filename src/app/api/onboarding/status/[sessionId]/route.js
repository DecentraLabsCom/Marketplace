/**
 * API Route: GET /api/onboarding/status/[sessionId]
 * 
 * Checks the status of an onboarding session by polling the Institutional Backend.
 * Used as a fallback when the IB callback doesn't arrive or as primary method
 * for checking onboarding completion status.
 * 
 * @module app/api/onboarding/status/[sessionId]
 */

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSessionFromCookies } from '@/utils/auth/sessionCookie'
import { checkOnboardingStatus, getOnboardingResult } from '@/utils/onboarding'
import devLog from '@/utils/dev/logger'

/**
 * GET /api/onboarding/status/[sessionId]
 * Checks onboarding session status from IB and/or local callback cache
 * 
 * Query params:
 * - gatewayUrl: The IB gateway URL (required)
 * - checkLocal: If "true", also check local callback cache
 * 
 * @param {Request} request - HTTP request
 * @param {Object} context - Route context with params
 * @returns {Response} Session status
 */
export async function GET(request, { params }) {
  try {
    const { sessionId } = await params
    const { searchParams } = new URL(request.url)
    const gatewayUrl = searchParams.get('gatewayUrl')
    const checkLocal = searchParams.get('checkLocal') === 'true'

    if (!sessionId) {
      return NextResponse.json(
        { error: 'Missing sessionId parameter' },
        { status: 400 }
      )
    }

    // Verify user has SSO session
    const cookieStore = await cookies()
    const session = getSessionFromCookies(cookieStore)
    if (!session || !session.isSSO) {
      return NextResponse.json(
        { error: 'SSO session required' },
        { status: 401 }
      )
    }

    devLog.log('[Onboarding/Status] Checking status for session:', sessionId)

    // Check local callback cache first if requested
    if (checkLocal) {
      const localResult = getOnboardingResult(`session:${sessionId}`)
      if (localResult) {
        devLog.log('[Onboarding/Status] Found result in local cache')
        return NextResponse.json({
          source: 'callback',
          ...localResult,
        })
      }
    }

    // Query IB if gatewayUrl provided
    if (gatewayUrl) {
      try {
        const status = await checkOnboardingStatus({
          sessionId,
          gatewayUrl,
        })

        return NextResponse.json({
          source: 'gateway',
          ...status,
        })
      } catch (error) {
        devLog.warn('[Onboarding/Status] Gateway query failed:', error.message)
        
        // If gateway fails, return pending status
        return NextResponse.json({
          source: 'gateway',
          sessionId,
          status: 'PENDING',
          error: error.message,
        })
      }
    }

    // No gatewayUrl and no local result
    return NextResponse.json({
      sessionId,
      status: 'UNKNOWN',
      message: 'Provide gatewayUrl to check with IB or wait for callback',
    })

  } catch (error) {
    devLog.error('[Onboarding/Status] Error:', error)
    return NextResponse.json(
      { error: 'Failed to check onboarding status' },
      { status: 500 }
    )
  }
}
