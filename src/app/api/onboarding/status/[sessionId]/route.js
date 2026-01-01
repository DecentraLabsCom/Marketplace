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
import { saveCredential } from '@/utils/webauthn/store'

/**
 * GET /api/onboarding/status/[sessionId]
 * Checks onboarding session status from IB and/or local callback cache
 * 
 * Query params:
 * - backendUrl: The IB backend URL (required)
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
    const backendUrl = searchParams.get('backendUrl')
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

    // Query IB if backendUrl provided
    if (backendUrl) {
      try {
        const status = await checkOnboardingStatus({
          sessionId,
          backendUrl,
        })

        if (
          (status.status === 'SUCCESS' || status.status === 'COMPLETED') &&
          status.stableUserId &&
          status.credentialId &&
          status.publicKey
        ) {
          saveCredential({
            puc: status.stableUserId,
            credentialId: status.credentialId,
            cosePublicKey: status.publicKey,
            aaguid: status.aaguid || undefined,
            signCount: 0,
            status: 'active',
            rpId: status.rpId || undefined,
          })
          devLog.log('[Onboarding/Status] Stored WebAuthn credential for:', status.stableUserId)
        }

        return NextResponse.json({
          source: 'backend',
          ...status,
        })
      } catch (error) {
        devLog.warn('[Onboarding/Status] Backend query failed:', error.message)
        
        // If backend fails, return pending status
        return NextResponse.json({
          source: 'backend',
          sessionId,
          status: 'PENDING',
          error: error.message,
        })
      }
    }

    // No backendUrl and no local result
    return NextResponse.json({
      sessionId,
      status: 'UNKNOWN',
      message: 'Provide backendUrl to check with IB or wait for callback',
    })

  } catch (error) {
    devLog.error('[Onboarding/Status] Error:', error)
    return NextResponse.json(
      { error: 'Failed to check onboarding status' },
      { status: 500 }
    )
  }
}
