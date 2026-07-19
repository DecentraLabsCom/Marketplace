import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import { handleGuardError } from '@/utils/auth/guards'
import { resolveBackendUrlForSession, resolveForwardHeaders } from '@/utils/api/backendProxyHelpers'
import { institutionalBackendFetch } from '@/utils/api/gatewayProxy'
import { publicErrorResponse, sanitizeErrorForLog } from '@/utils/security/publicError'

export async function GET(request, { params }) {
  try {
    const { backendUrl, institutionDomain } = await resolveBackendUrlForSession()
    if (!backendUrl) {
      return NextResponse.json({ error: 'Missing institutional backend URL' }, { status: 400 })
    }

    const sessionId =
      params?.sessionId ||
      request.nextUrl.searchParams.get('sessionId') ||
      null
    if (!sessionId || sessionId === 'null' || sessionId === 'undefined') {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
    }

    const headers = await resolveForwardHeaders({
      backendUrl,
      institutionId: institutionDomain,
      scope: 'intents:status',
    })
    const res = await institutionalBackendFetch(
      `${backendUrl}/intents/authorize/status/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers,
      cache: 'no-store',
      },
    )

    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      return publicErrorResponse({
        status: res.status || 502,
        code: 'AUTHORIZATION_STATUS_UPSTREAM_FAILED',
        message: 'The authorization status could not be loaded.',
        error: new Error(`Institutional authorization status returned ${res.status}`),
        context: 'authorization-status-upstream',
      })
    }

    return NextResponse.json(payload, { status: 200 })
  } catch (error) {
    devLog.error('[API] Intent authorization status proxy failed', { error: sanitizeErrorForLog(error) })
    if (error?.name === 'UnauthorizedError' || error?.name === 'ForbiddenError') {
      return handleGuardError(error, request)
    }
    return publicErrorResponse({
      status: 502,
      code: 'AUTHORIZATION_STATUS_FAILED',
      message: 'The authorization status could not be loaded.',
      error,
      context: 'authorization-status',
    })
  }
}
