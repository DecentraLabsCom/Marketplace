/**
 * API Route: GET /api/onboarding/session
 * 
 * Returns non-sensitive onboarding identity metadata for the browser.
 * Credentials and the backend request payload stay server-side in the
 * same-origin WebAuthn proxy routes.
 * 
 * @module app/api/onboarding/session
 */

import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import { publicErrorResponse } from '@/utils/security/publicError'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'
import { getOnboardingContext, OnboardingContextError, publicOnboardingMeta } from '@/utils/onboarding/serverOnboarding'

const checkRate = createRateLimiter({ operation: 'onboarding-session', windowMs: 60_000, maxRequests: 10 })

/**
 * GET /api/onboarding/session
 * Returns non-sensitive session data used for local browser state only.
 * 
 * @returns {Response} JSON with user data for IB onboarding
 */
export async function GET(request = new Request('http://localhost/api/onboarding/session')) {
  try {
    const context = await getOnboardingContext({ includeBackend: false })

    const rateLimitResponse = createRateLimitResponse(await checkRate(request, context.session))
    if (rateLimitResponse) return rateLimitResponse

    devLog.log('[Onboarding/Session] Returning non-sensitive session data for:', context.stableUserId)

    return NextResponse.json({
      status: 'ok',
      meta: publicOnboardingMeta(context),
    })

  } catch (error) {
    if (error instanceof OnboardingContextError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    }
    return publicErrorResponse({
      status: 500,
      code: 'ONBOARDING_SESSION_FAILED',
      message: 'The onboarding session could not be prepared.',
      error,
      context: 'onboarding-session',
    })
  }
}
