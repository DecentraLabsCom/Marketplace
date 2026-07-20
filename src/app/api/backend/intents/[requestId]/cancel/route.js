import { NextResponse } from 'next/server'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { resolveBackendUrlForSession, resolveForwardHeaders } from '@/utils/api/backendProxyHelpers'
import { institutionalBackendFetch } from '@/utils/api/gatewayProxy'
import { cancelIntentOnChain } from '@/utils/intents/adminIntentSigner'
import { getServerSignerAddress, withIntentSignerLock } from '@/utils/intents/intentNonceStore'
import { getRegisteredIntent, removeRegisteredIntent } from '@/utils/intents/intentLifecycleStore'
import { publicErrorResponse, sanitizeErrorForLog } from '@/utils/security/publicError'
import devLog from '@/utils/dev/logger'

const normalize = (value) => typeof value === 'string' ? value.trim() : ''

const sameInstitution = (left, right) => normalize(left).toLowerCase() === normalize(right).toLowerCase()

export async function POST(request, { params }) {
  try {
    await requireAuth()
    const requestId = normalize(params?.requestId || request.nextUrl.searchParams.get('requestId'))
    if (!requestId || requestId === 'null' || requestId === 'undefined') {
      return NextResponse.json({ error: 'Missing requestId' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const authorizationSessionId = normalize(body?.authorizationSessionId)
    if (!authorizationSessionId) {
      return NextResponse.json({ error: 'Missing authorizationSessionId' }, { status: 400 })
    }

    const lifecycle = await getRegisteredIntent(requestId)
    const { backendUrl, institutionDomain } = await resolveBackendUrlForSession()
    if (lifecycle) {
      if (
        lifecycle.requestId !== requestId
        || lifecycle.authorizationSessionId !== authorizationSessionId
        || !sameInstitution(lifecycle.institutionDomain, institutionDomain)
      ) {
        return NextResponse.json({ error: 'Intent cancellation is not bound to this authorization session' }, { status: 403 })
      }
    }

    let authorizationStatus = null
    if (backendUrl) {
      const headers = await resolveForwardHeaders({
        backendUrl,
        institutionId: institutionDomain,
        scope: 'intents:status',
      })
      const upstream = await institutionalBackendFetch(
        `${backendUrl}/intents/authorize/status/${encodeURIComponent(authorizationSessionId)}`,
        { method: 'GET', headers, cache: 'no-store' },
      )
      authorizationStatus = await upstream.json().catch(() => ({}))
      if (!upstream.ok && !lifecycle) {
        return publicErrorResponse({
          status: upstream.status || 502,
          code: 'INTENT_CANCELLATION_STATUS_UNAVAILABLE',
          message: 'The intent cancellation could not be verified.',
          error: new Error(`Authorization status returned ${upstream.status}`),
          context: 'intent-cancellation-status',
        })
      }
      if (authorizationStatus?.requestId && authorizationStatus.requestId !== requestId) {
        return NextResponse.json({ error: 'Authorization session does not match requestId' }, { status: 403 })
      }
    } else if (!lifecycle) {
      return NextResponse.json({ error: 'Missing institutional backend URL' }, { status: 400 })
    }

    if (String(authorizationStatus?.status || '').toUpperCase() === 'SUCCESS') {
      return NextResponse.json({
        requestId,
        status: 'already_authorized',
      }, { status: 409 })
    }

    const result = await withIntentSignerLock(
      getServerSignerAddress(),
      () => cancelIntentOnChain(requestId),
    )
    await Promise.resolve(removeRegisteredIntent(requestId)).catch((error) => {
      devLog.warn('[API] Intent lifecycle record cleanup failed', sanitizeErrorForLog(error))
    })

    return NextResponse.json({ requestId, ...result }, { status: 200 })
  } catch (error) {
    devLog.error('[API] Intent cancellation failed', { error: sanitizeErrorForLog(error) })
    if (error?.name === 'UnauthorizedError' || error?.name === 'ForbiddenError') {
      return handleGuardError(error, request)
    }
    return publicErrorResponse({
      status: 502,
      code: 'INTENT_CANCELLATION_FAILED',
      message: 'The abandoned intent could not be cancelled.',
      error,
      context: 'intent-cancellation',
    })
  }
}
