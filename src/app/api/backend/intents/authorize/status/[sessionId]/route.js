import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'

function resolveBackendUrl(request) {
  const { searchParams } = request.nextUrl
  const override = searchParams.get('backendUrl')
  return override || process.env.INSTITUTION_BACKEND_URL || null
}

function resolveForwardHeaders(request) {
  const headers = { 'Content-Type': 'application/json' }
  const auth = request.headers.get('authorization')
  if (auth) {
    headers.Authorization = auth
  }
  const apiKey = request.headers.get('x-api-key') || process.env.INSTITUTION_BACKEND_SP_API_KEY
  if (apiKey) {
    headers['x-api-key'] = apiKey
  }
  return headers
}

export async function GET(request, { params }) {
  try {
    const backendUrl = resolveBackendUrl(request)
    if (!backendUrl) {
      return NextResponse.json({ error: 'Missing institutional backend URL' }, { status: 400 })
    }

    const sessionId = params?.sessionId
    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
    }

    const headers = resolveForwardHeaders(request)
    const res = await fetch(`${backendUrl.replace(/\/$/, '')}/intents/authorize/status/${sessionId}`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    })

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
