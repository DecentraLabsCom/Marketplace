/**
 * API Route: POST /api/onboarding/callback
 * 
 * Receives asynchronous callbacks from the Institutional Backend (IB)
 * when a user completes or fails the WebAuthn onboarding ceremony.
 * 
 * This endpoint is called by the IB, not by the user's browser.
 * The callback may arrive shortly after the browser receives its response
 * from the IB's ceremony page.
 * 
 * Expected payload (success):
 * {
 *   "status": "SUCCESS",
 *   "stableUserId": "uid=jgarcia,ou=people,o=uned,c=es",
 *   "institutionId": "uned.es",
 *   "credentialId": "AbCdEf123456...",
 *   "aaguid": "00000000-0000-0000-0000-000000000000",
 *   "timestamp": "2025-12-13T10:30:00.000Z"
 * }
 * 
 * Expected payload (failure):
 * {
 *   "status": "FAILED",
 *   "stableUserId": "...",
 *   "institutionId": "...",
 *   "error": "User cancelled the ceremony",
 *   "timestamp": "2025-12-13T10:30:00.000Z"
 * }
 * 
 * @module app/api/onboarding/callback
 */

import { NextResponse } from 'next/server'
import { 
  storeOnboardingResult, 
  getOnboardingResult 
} from '@/utils/onboarding'
import devLog from '@/utils/dev/logger'
import { onboardingEventBus } from '../_eventBus'
import { saveCredential } from '@/utils/webauthn/store'
import { normalizePuc } from '@/utils/auth/puc'

/**
 * POST /api/onboarding/callback
 * Receives onboarding completion notification from IB
 * 
 * @param {Request} request - HTTP request from IB
 * @returns {Response} Acknowledgment response
 */
export async function POST(request) {
  try {
    const body = await request.json()
    const stableUserId = normalizePuc(body?.stableUserId)

    devLog.log('[Onboarding/Callback] Received callback:', {
      status: body.status,
      stableUserId,
      institutionId: body.institutionId,
      hasCredentialId: !!body.credentialId,
    })

    // Validate required fields
    if (!body.status) {
      devLog.warn('[Onboarding/Callback] Missing status field')
      return NextResponse.json(
        { error: 'Missing required field: status' },
        { status: 400 }
      )
    }

    const isSuccess = body.status === 'SUCCESS' || body.status === 'COMPLETED'
    const isFailed = body.status === 'FAILED'

    if (!isSuccess && !isFailed) {
      devLog.warn('[Onboarding/Callback] Unknown status:', body.status)
      // Accept it anyway but log warning
    }

    const publicKey =
      body.publicKey ||
      body.publicKeyCose ||
      body.cosePublicKey ||
      null

    // Store result for the user/session
    const result = {
      status: body.status,
      success: isSuccess,
      stableUserId: stableUserId || null,
      institutionId: body.institutionId || null,
      sessionId: body.sessionId || null,
      credentialId: body.credentialId || null,
      publicKey,
      rpId: body.rpId || null,
      aaguid: body.aaguid || null,
      error: body.error || null,
      timestamp: body.timestamp || new Date().toISOString(),
    }

    if (isSuccess && result.stableUserId && result.credentialId && result.publicKey) {
      saveCredential({
        puc: result.stableUserId,
        credentialId: result.credentialId,
        cosePublicKey: result.publicKey,
        aaguid: result.aaguid || undefined,
        signCount: 0,
        status: 'active',
        rpId: result.rpId || undefined,
      })
      devLog.log('[Onboarding/Callback] Stored WebAuthn credential for:', result.stableUserId)
    } else if (isSuccess) {
      devLog.warn('[Onboarding/Callback] Missing credential data for local store:', {
        hasStableUserId: !!result.stableUserId,
        hasCredentialId: !!result.credentialId,
        hasPublicKey: !!result.publicKey,
      })
    }

    // Store by multiple keys for flexible lookup
    if (stableUserId) {
      storeOnboardingResult(`user:${stableUserId}`, result)
    }
    if (body.sessionId) {
      storeOnboardingResult(`session:${body.sessionId}`, result)
    }
    if (stableUserId && body.institutionId) {
      storeOnboardingResult(`${body.institutionId}:${stableUserId}`, result)
    }

    // Notify SSE subscribers (best-effort, instance-local)
    onboardingEventBus.publish(
      [
        stableUserId ? `user:${stableUserId}` : null,
        body.sessionId ? `session:${body.sessionId}` : null,
        stableUserId && body.institutionId ? `${body.institutionId}:${stableUserId}` : null,
      ],
      result,
    )

    // Log completion
    if (isSuccess) {
      devLog.log('[Onboarding/Callback] ✅ Onboarding completed for:', body.stableUserId)
    } else if (isFailed) {
      devLog.warn('[Onboarding/Callback] ❌ Onboarding failed for:', body.stableUserId, 'Error:', body.error)
    }

    // TODO: Optionally notify connected clients via WebSocket/SSE
    // This would allow the browser to know immediately without polling

    return NextResponse.json({
      received: true,
      status: result.status,
      timestamp: new Date().toISOString(),
    })

  } catch (error) {
    devLog.error('[Onboarding/Callback] Error processing callback:', error)
    return NextResponse.json(
      { error: 'Failed to process callback' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/onboarding/callback
 * Retrieves stored onboarding result (for polling fallback)
 * 
 * Query params:
 * - stableUserId: User identifier
 * - sessionId: Onboarding session ID
 * - institutionId: Institution identifier (optional, for compound lookup)
 * 
 * @param {Request} request - HTTP request
 * @returns {Response} Stored result or not found
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const stableUserId = normalizePuc(searchParams.get('stableUserId'))
    const sessionId = searchParams.get('sessionId')
    const institutionId = searchParams.get('institutionId')

    let result = null

    // Try different lookup keys
    if (sessionId) {
      result = getOnboardingResult(`session:${sessionId}`)
    }
    
    if (!result && stableUserId && institutionId) {
      result = getOnboardingResult(`${institutionId}:${stableUserId}`)
    }
    
    if (!result && stableUserId) {
      result = getOnboardingResult(`user:${stableUserId}`)
    }

    if (!result) {
      return NextResponse.json(
        { found: false, message: 'No onboarding result found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      found: true,
      ...result,
    })

  } catch (error) {
    devLog.error('[Onboarding/Callback] GET Error:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve onboarding result' },
      { status: 500 }
    )
  }
}
