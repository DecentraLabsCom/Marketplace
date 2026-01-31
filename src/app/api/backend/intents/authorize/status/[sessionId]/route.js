import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'

function resolveBackendUrl(request) {
  const { searchParams } = request.nextUrl
  const override = searchParams.get('backendUrl')
  return override || process.env.INSTITUTION_BACKEND_URL || null
}

function shouldUseServerToken(request) {
  const { searchParams } = request.nextUrl
  return searchParams.get('useServerToken') === '1'
}

async function resolveForwardHeaders(request) {
  const headers = { 'Content-Type': 'application/json' }
  const rawAuth = request.headers.get('authorization')
  const normalizedAuth = rawAuth && rawAuth.trim().length > 0 ? rawAuth.trim() : null
  const looksInvalid =
    !normalizedAuth ||
    /^bearer\s+null$/i.test(normalizedAuth) ||
    /^bearer\s+undefined$/i.test(normalizedAuth)
  if (normalizedAuth && !looksInvalid && !shouldUseServerToken(request)) {
    headers.Authorization = normalizedAuth
  } else {
    try {
      const backendAuth = await marketplaceJwtService.generateIntentBackendToken()
      headers.Authorization = `Bearer ${backendAuth.token}`
    } catch (error) {
      devLog.warn('[API] Failed to generate intent backend token for status proxy', error)
    }
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

    const headers = await resolveForwardHeaders(request)
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
