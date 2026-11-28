import { NextResponse } from 'next/server'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'
import { GatewayValidationError, buildGatewayTargetUrl, gatewayFetch, resolveLabAccessGateway } from '@/utils/api/gatewayProxy'
import { requireFmuResourceContext, resolveFmuGatewayHeaders } from '@/utils/auth/fmuGatewayContext'
import { publicErrorResponse } from '@/utils/security/publicError'
import { validateGatewayConnectionGrant } from '@/utils/fmu/validateGatewayConnectionGrant'

const checkRate = createRateLimiter({ operation: 'fmu-connection', windowMs: 60_000, maxRequests: 10 })

/** Issue a one-use capability. All simulation traffic subsequently bypasses Marketplace. */
export async function POST(request) {
  try {
    const origin = request.headers.get('origin')
    const fetchSite = request.headers.get('sec-fetch-site')
    if ((fetchSite && fetchSite !== 'same-origin') || (origin && origin !== new URL(request.url).origin && fetchSite !== 'same-origin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'A JSON connection request is required.' }, { status: 400 })
    }
    const { labId, reservationKey } = body
    if (!/^\d{1,78}$/.test(String(labId || '')) || typeof reservationKey !== 'string' || !reservationKey || reservationKey.length > 256) {
      return NextResponse.json({ error: 'labId and reservationKey are required.' }, { status: 400 })
    }
    const gatewayBaseUrl = await resolveLabAccessGateway({ labId })
    const context = await requireFmuResourceContext(request, { labId, reservationKey, gatewayOrigin: gatewayBaseUrl })
    const limited = createRateLimitResponse(await checkRate(request, { userId: context?.userBinding || context?.resourceSessionId }))
    if (limited) return limited
    const upstream = await gatewayFetch(buildGatewayTargetUrl(gatewayBaseUrl, `/fmu/api/v1/fmu/connection/${encodeURIComponent(labId)}`, { reservationKey }), {
      method: 'POST',
      headers: resolveFmuGatewayHeaders(request, { labId, reservationKey, gatewayOrigin: gatewayBaseUrl, context }),
      cache: 'no-store', signal: request.signal,
    })
    if (!upstream.ok) throw new GatewayValidationError('The provider could not authorize the FMU session.', upstream.status)
    const connection = validateGatewayConnectionGrant(await upstream.json(), {
      gatewayBaseUrl,
      labId,
      reservationKey,
    })
    return NextResponse.json(connection, { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } })
  } catch (error) {
    return publicErrorResponse({ status: error instanceof GatewayValidationError ? error.status : 500,
      code: 'FMU_CONNECTION_FAILED', message: 'The provider FMU connection could not be authorized.', error, context: 'fmu-connection' })
  }
}
