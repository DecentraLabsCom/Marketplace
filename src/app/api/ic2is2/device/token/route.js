import { createHash, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'
import {
  consumeIc2is2DeviceAuthorization,
  hashIc2is2DeviceCode,
  readIc2is2DeviceAuthorization,
} from '@/utils/auth/ic2is2DeviceAuthorization'
import { publicErrorResponse } from '@/utils/security/publicError'

const checkRate = createRateLimiter({ operation: 'ic2is2-device-token', windowMs: 60_000, maxRequests: 60 })
const DEVICE_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/

function sameOriginIfBrowser(request) {
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  return (!fetchSite || ['same-origin', 'none'].includes(fetchSite))
    && (!origin || origin === new URL(request.url).origin)
}

function codeChallenge(verifier) {
  return createHash('sha256').update(verifier).digest('base64url')
}

function sameSecret(left, right) {
  const leftBuffer = Buffer.from(String(left || ''))
  const rightBuffer = Buffer.from(String(right || ''))
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function pendingResponse() {
  return NextResponse.json({ error: 'authorization_pending', interval: 3 }, {
    status: 202,
    headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
  })
}

export async function POST(request) {
  try {
    if (!sameOriginIfBrowser(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const body = await request.json().catch(() => null)
    const deviceCode = typeof body?.deviceCode === 'string' ? body.deviceCode : ''
    const verifier = typeof body?.codeVerifier === 'string' ? body.codeVerifier : ''
    if (!DEVICE_CODE_PATTERN.test(deviceCode) || !CODE_VERIFIER_PATTERN.test(verifier)) {
      return NextResponse.json({ error: 'invalid_grant' }, { status: 400 })
    }

    const limited = createRateLimitResponse(await checkRate(request))
    if (limited) return limited

    const deviceCodeHash = hashIc2is2DeviceCode(deviceCode)
    const pending = await readIc2is2DeviceAuthorization(deviceCodeHash)
    if (!pending) return NextResponse.json({ error: 'expired_token' }, { status: 400 })
    const expectedChallenge = String(pending.codeChallenge || '')
    const actualChallenge = codeChallenge(verifier)
    if (!sameSecret(expectedChallenge, actualChallenge)) {
      return NextResponse.json({ error: 'invalid_grant' }, { status: 400 })
    }
    if (pending.status === 'pending') return pendingResponse()
    if (pending.status === 'denied') {
      const denied = await consumeIc2is2DeviceAuthorization(deviceCodeHash)
      if (denied?.status === 'denied' && sameSecret(denied.codeChallenge, expectedChallenge)) {
        return NextResponse.json({ error: 'access_denied' }, { status: 400, headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } })
      }
      return NextResponse.json({ error: 'invalid_grant' }, { status: 400 })
    }
    if (pending.status !== 'approved' || !pending.grant) {
      return NextResponse.json({ error: 'invalid_grant' }, { status: 400 })
    }

    const consumed = await consumeIc2is2DeviceAuthorization(deviceCodeHash)
    if (!consumed || consumed.status !== 'approved' || !consumed.grant
      || consumed.capability !== pending.capability
      || !sameSecret(consumed.codeChallenge, expectedChallenge)
      || Number(consumed.expiresAt) <= Math.floor(Date.now() / 1000)) {
      return NextResponse.json({ error: 'invalid_grant' }, { status: 400 })
    }

    return NextResponse.json({
      ...consumed.grant,
      grantType: consumed.capability,
      grantedAt: consumed.approvedAt,
      expiresAt: consumed.expiresAt,
    }, { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } })
  } catch (error) {
    return publicErrorResponse({
      status: 503,
      code: 'IC2IS2_DEVICE_TOKEN_UNAVAILABLE',
      message: 'The IC2IS2 authorization could not be redeemed.',
      error,
      context: 'ic2is2-device-token',
    })
  }
}
