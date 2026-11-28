import { NextResponse } from 'next/server'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'
import { getIc2is2Capability } from '@/utils/auth/ic2is2Capabilities'
import { createIc2is2DeviceAuthorization, IC2IS2_DEVICE_AUTH_TTL_SECONDS } from '@/utils/auth/ic2is2DeviceAuthorization'
import { publicErrorResponse } from '@/utils/security/publicError'

const checkRate = createRateLimiter({ operation: 'ic2is2-device-init', windowMs: 60_000, maxRequests: 5 })
const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/

function isAllowedRequestOrigin(request) {
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) return false
  return !origin || origin === new URL(request.url).origin
}

function verificationUri() {
  const base = String(process.env.MARKETPLACE_BASE_URL || '').trim()
  if (!base) throw new Error('MARKETPLACE_BASE_URL is required')
  const url = new URL(base)
  if (url.username || url.password || !['', '/'].includes(url.pathname) || url.search || url.hash) {
    throw new Error('MARKETPLACE_BASE_URL must be an origin')
  }
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')) {
    throw new Error('MARKETPLACE_BASE_URL must use HTTPS')
  }
  url.pathname = '/ic2is2/authorize'
  url.search = ''
  url.hash = ''
  return url.toString()
}

export async function POST(request) {
  try {
    if (!isAllowedRequestOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'A JSON device authorization request is required.' }, { status: 400 })
    }

    const { capability, labId, reservationKey, codeChallenge } = body
    if (!getIc2is2Capability(capability)) {
      return NextResponse.json({ error: 'A supported capability is required.' }, { status: 400 })
    }
    if ((typeof labId !== 'string' && !Number.isSafeInteger(labId))
      || !/^\d{1,78}$/.test(String(labId))
      || typeof reservationKey !== 'string' || !reservationKey.trim() || reservationKey.length > 256
      || typeof codeChallenge !== 'string' || !CODE_CHALLENGE_PATTERN.test(codeChallenge)) {
      return NextResponse.json({ error: 'labId, reservationKey and a SHA-256 codeChallenge are required.' }, { status: 400 })
    }

    const limited = createRateLimitResponse(await checkRate(request))
    if (limited) return limited

    const verification = verificationUri()
    const { deviceCode, userCode } = await createIc2is2DeviceAuthorization({
      capability,
      labId,
      reservationKey,
      codeChallenge,
    })

    return NextResponse.json({
      deviceCode,
      userCode,
      verificationUri: verification,
      expiresIn: IC2IS2_DEVICE_AUTH_TTL_SECONDS,
      interval: 3,
    }, { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } })
  } catch (error) {
    return publicErrorResponse({
      status: 503,
      code: 'IC2IS2_DEVICE_AUTH_UNAVAILABLE',
      message: 'IC2IS2 authorization could not be started.',
      error,
      context: 'ic2is2-device-init',
    })
  }
}
