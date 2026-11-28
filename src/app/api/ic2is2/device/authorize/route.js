import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'
import { GatewayValidationError } from '@/utils/api/gatewayProxy'
import { getIc2is2Capability } from '@/utils/auth/ic2is2Capabilities'
import {
  claimIc2is2DeviceAuthorization,
  completeIc2is2DeviceAuthorization,
  hashIc2is2UserCode,
  normalizeIc2is2UserCode,
  readIc2is2AuthorizationByUserCode,
  readIc2is2DeviceAuthorization,
  releaseIc2is2DeviceAuthorizationClaim,
} from '@/utils/auth/ic2is2DeviceAuthorization'
import { HttpError, requireAuth, handleGuardError } from '@/utils/auth/guards'
import { publicErrorResponse } from '@/utils/security/publicError'

const lookupRate = createRateLimiter({ operation: 'ic2is2-device-lookup', windowMs: 60_000, maxRequests: 20 })
const approveRate = createRateLimiter({ operation: 'ic2is2-device-approve', windowMs: 60_000, maxRequests: 5 })
const USER_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4}-?[A-HJ-NP-Z2-9]{4}$/

function sameOriginRequest(request) {
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')
  return (!fetchSite || fetchSite === 'same-origin')
    && (!origin || origin === new URL(request.url).origin)
}

async function resolvePendingAuthorization(request, userCode) {
  const normalized = normalizeIc2is2UserCode(userCode)
  if (!USER_CODE_PATTERN.test(String(userCode || '').toUpperCase().replace(/\s/g, ''))) {
    return { response: NextResponse.json({ error: 'Enter a valid IC2IS2 code.' }, { status: 400 }) }
  }

  const limited = createRateLimitResponse(await lookupRate(request))
  if (limited) return { response: limited }

  const entry = await readIc2is2AuthorizationByUserCode(hashIc2is2UserCode(normalized))
  if (!entry || entry.record.status !== 'pending') {
    return { response: NextResponse.json({ error: 'This code is invalid, expired, or already used.' }, { status: 404 }) }
  }

  return { entry }
}

function requireCapability(record) {
  const capability = getIc2is2Capability(record.capability)
  if (!capability) throw new GatewayValidationError('This IC2IS2 capability is no longer supported.', 400)
  return capability
}

export async function POST(request) {
  let claim
  let deviceCodeHash
  try {
    if (!sameOriginRequest(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const session = await requireAuth()
    const body = await request.json().catch(() => null)
    const userCode = typeof body?.userCode === 'string' ? body.userCode : ''
    const action = body?.action
    if (!['preview', 'approve', 'deny'].includes(action)) {
      return NextResponse.json({ error: 'A supported authorization action is required.' }, { status: 400 })
    }
    const result = await resolvePendingAuthorization(request, userCode)
    if (result.response) return result.response
    const { entry } = result

    if (action === 'preview') {
      const capability = requireCapability(entry.record)
      await capability.authorize(request, entry.record, session)
      return NextResponse.json({
        capability: entry.record.capability,
        label: capability.label,
        description: capability.description,
        labId: entry.record.labId,
        reservationKey: entry.record.reservationKey,
        expiresAt: entry.record.expiresAt,
      }, { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } })
    }

    const limited = createRateLimitResponse(await approveRate(request, {
      userId: session.id || session.email,
    }))
    if (limited) return limited

    deviceCodeHash = entry.deviceCodeHash
    const claimToken = randomBytes(24).toString('base64url')
    if (!(await claimIc2is2DeviceAuthorization(deviceCodeHash, claimToken))) {
      return NextResponse.json({ error: 'This IC2IS2 request is already being decided.' }, { status: 409 })
    }
    claim = claimToken

    const current = await readIc2is2DeviceAuthorization(deviceCodeHash)
    if (!current || current.status !== 'pending') {
      return NextResponse.json({ error: 'This IC2IS2 request is no longer pending.' }, { status: 409 })
    }

    if (action === 'deny') {
      const now = Math.floor(Date.now() / 1000)
      const denied = await completeIc2is2DeviceAuthorization({
        deviceCodeHash,
        claimToken: claim,
        record: { ...current, status: 'denied', deniedAt: now },
        ttlSeconds: Math.max(1, current.expiresAt - now),
      })
      if (!denied) throw new GatewayValidationError('The IC2IS2 request expired before denial completed.', 410)
      claim = null
      return NextResponse.json({ denied: true }, { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } })
    }

    const capability = requireCapability(current)
    const context = await capability.authorize(request, current, session)
    const { grant, expiresAt, approvedBy } = await capability.issue(request, current, context)
    const now = Math.floor(Date.now() / 1000)
    const ttlSeconds = Math.min(current.expiresAt - now, Math.floor(expiresAt - now))
    if (ttlSeconds <= 0) throw new GatewayValidationError('The provider connection grant has expired.', 502)

    const approved = await completeIc2is2DeviceAuthorization({
      deviceCodeHash,
      claimToken: claim,
      record: {
        ...current,
        status: 'approved',
        approvedAt: now,
        expiresAt: now + ttlSeconds,
        grant,
        approvedBy,
      },
      ttlSeconds,
    })
    if (!approved) throw new GatewayValidationError('The IC2IS2 request expired before approval completed.', 410)
    claim = null

    return NextResponse.json({ approved: true }, { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } })
  } catch (error) {
    if (error instanceof GatewayValidationError) {
      return publicErrorResponse({ status: error.status || 400, code: 'IC2IS2_AUTHORIZATION_FAILED', message: 'This IC2IS2 request could not be authorized.', error, context: 'ic2is2-device-authorize' })
    }
    if (error instanceof HttpError) return handleGuardError(error, request)
    return publicErrorResponse({ status: 503, code: 'IC2IS2_AUTHORIZATION_UNAVAILABLE', message: 'IC2IS2 authorization is temporarily unavailable.', error, context: 'ic2is2-device-authorize' })
  } finally {
    if (claim && deviceCodeHash) {
      await releaseIc2is2DeviceAuthorizationClaim(deviceCodeHash, claim).catch(() => {})
    }
  }
}
