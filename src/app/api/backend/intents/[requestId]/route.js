import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import { handleGuardError } from '@/utils/auth/guards'
import { resolveBackendUrlForSession, resolveForwardHeaders } from '@/utils/api/backendProxyHelpers'
import { institutionalBackendFetch } from '@/utils/api/gatewayProxy'
import { publicErrorResponse, sanitizeErrorForLog } from '@/utils/security/publicError'

export async function GET(request, { params }) {
  try {
    const { backendUrl } = await resolveBackendUrlForSession()
    if (!backendUrl) {
      return NextResponse.json({ error: 'Missing institutional backend URL' }, { status: 400 })
    }

    const requestId =
      params?.requestId ||
      request.nextUrl.searchParams.get('requestId') ||
      null
    
    if (!requestId || requestId === 'null' || requestId === 'undefined') {
      return NextResponse.json({ error: 'Missing requestId' }, { status: 400 })
    }

    const headers = await resolveForwardHeaders()
    const res = await institutionalBackendFetch(`${backendUrl}/intents/${encodeURIComponent(requestId)}`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    })

    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      return publicErrorResponse({
        status: res.status || 502,
        code: 'INTENT_STATUS_UPSTREAM_FAILED',
        message: 'The intent status could not be loaded.',
        error: new Error(`Institutional intent status returned ${res.status}`),
        context: 'intent-status-upstream',
      })
    }

    return NextResponse.json(payload, { status: 200 })
  } catch (error) {
    devLog.error('[API] Intent status proxy failed', { error: sanitizeErrorForLog(error) })
    if (error?.name === 'UnauthorizedError' || error?.name === 'ForbiddenError') {
      return handleGuardError(error, request)
    }
    return publicErrorResponse({
      status: 502,
      code: 'INTENT_STATUS_FAILED',
      message: 'The intent status could not be loaded.',
      error,
      context: 'intent-status',
    })
  }
}
