import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import { resolveBackendUrl, resolveForwardHeaders } from '@/utils/api/backendProxyHelpers'

export async function GET(request, { params }) {
  try {
    const backendUrl = resolveBackendUrl(request)
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

    const headers = await resolveForwardHeaders(request)
    const res = await fetch(`${backendUrl.replace(/\/$/, '')}/intents/${requestId}`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    })

    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { error: payload?.error || payload?.message || 'Failed to fetch intent status' },
        { status: res.status },
      )
    }

    return NextResponse.json(payload, { status: 200 })
  } catch (error) {
    devLog.error('[API] Intent status proxy failed', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch intent status' },
      { status: 502 },
    )
  }
}
