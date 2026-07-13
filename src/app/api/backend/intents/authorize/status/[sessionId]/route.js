import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import { resolveBackendUrl, resolveForwardHeaders } from '@/utils/api/backendProxyHelpers'
import { institutionalBackendFetch } from '@/utils/api/gatewayProxy'

export async function GET(request, { params }) {
  try {
    const backendUrl = resolveBackendUrl(request)
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

    const headers = await resolveForwardHeaders(request)
    const res = await institutionalBackendFetch(
      `${backendUrl}/intents/authorize/status/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers,
      cache: 'no-store',
      },
    )

    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { error: payload?.error || payload?.message || 'Failed to fetch authorization status' },
        { status: res.status },
      )
    }

    return NextResponse.json(payload, { status: 200 })
  } catch (error) {
    devLog.error('[API] Intent authorization status proxy failed', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch authorization status' },
      { status: 502 },
    )
  }
}
