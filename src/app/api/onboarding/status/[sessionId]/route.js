/**
 * API Route: GET /api/onboarding/status/[sessionId]
 * 
 * Checks the local callback cache and, while awaiting a callback, relays the
 * institutional status through the authenticated same-origin boundary.
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
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'
import { institutionalBackendFetch } from '@/utils/api/gatewayProxy'
import { createOnboardingBackendHeaders, getOnboardingContext, OnboardingContextError } from '@/utils/onboarding/serverOnboarding'

const checkRate = createRateLimiter({ operation: 'onboarding-status', windowMs: 60_000, maxRequests: 30 })

/**
 * GET /api/onboarding/status/[sessionId]
 * Checks onboarding session status from local callback cache
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

    const rateLimitResponse = createRateLimitResponse(await checkRate(request, session))
    if (rateLimitResponse) return rateLimitResponse

    devLog.log('[Onboarding/Status] Checking local cache for session:', sessionId)

    // Check local callback cache
    const localResult = getOnboardingResult(`session:${sessionId}`)
    if (localResult) {
      devLog.log('[Onboarding/Status] Found result in local cache')
      return NextResponse.json(toPublicOnboardingResult(localResult, 'callback'))
    }

    const context = await getOnboardingContext()
    const upstream = await institutionalBackendFetch(
      `${context.backendUrl}/onboarding/webauthn/status/${encodeURIComponent(sessionId)}`,
      { headers: await createOnboardingBackendHeaders(context), cache: 'no-store' },
    )
    if (!upstream.ok) {
      return NextResponse.json({ sessionId, status: 'PENDING', source: 'marketplace' })
    }
    return NextResponse.json(toPublicOnboardingResult(await upstream.json(), 'institutional-backend'))

  } catch (error) {
    if (error instanceof OnboardingContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
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
