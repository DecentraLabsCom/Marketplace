import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { resolveBackendUrl, resolveForwardHeaders } from '@/utils/api/backendProxyHelpers'
import { secureBackendJsonRequest } from '@/utils/api/secureBackendFetch'

export async function GET(request, { params }) {
  try {
    const session = await requireAuth()
    const backendUrl = await resolveBackendUrl(session)
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

    const headers = await resolveForwardHeaders(backendUrl)
    const response = await secureBackendJsonRequest(
      backendUrl,
      `/intents/authorize/status/${encodeURIComponent(sessionId)}`,
      {
      method: 'GET',
      headers,
      cache: 'no-store',
      },
    )

    const payload = response.data
    if (!response.ok) {
      return NextResponse.json(
        { error: payload?.error || payload?.message || 'Failed to fetch authorization status' },
        { status: response.status },
      )
    }

    return NextResponse.json(payload, { status: 200 })
  } catch (error) {
    devLog.error('[API] Intent authorization status proxy failed', error)
    if (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError') {
      return handleGuardError(error)
    }
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch authorization status' },
      { status: 502 },
    )
  }
}
