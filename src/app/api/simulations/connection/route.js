import { NextResponse } from 'next/server'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'
import { GatewayValidationError, buildGatewayTargetUrl, gatewayFetch, resolveLabAccessGateway } from '@/utils/api/gatewayProxy'
import { requireFmuResourceContext, resolveFmuGatewayHeaders } from '@/utils/auth/fmuGatewayContext'
import { isValidConnectionConfig } from '@decentralabs/digital-twin-app-protocol'
import { publicErrorResponse } from '@/utils/security/publicError'

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
    const connection = await upstream.json()
    if (!isValidConnectionConfig(connection)) throw new GatewayValidationError('Invalid provider connection grant.', 502)
    const endpoint = new URL(connection.gatewayWsUrl)
    const gateway = new URL(gatewayBaseUrl)
    if (endpoint.host !== gateway.host || endpoint.protocol !== (gateway.protocol === 'https:' ? 'wss:' : 'ws:')
      || endpoint.pathname !== '/fmu/api/v1/fmu/sessions' || connection.labId !== String(labId)
      || connection.reservationKey.toLowerCase() !== reservationKey.toLowerCase() || connection.ticketExpiresAt <= Date.now() / 1000) {
      throw new GatewayValidationError('The provider connection grant does not match this reservation.', 502)
    }
    return NextResponse.json(connection, { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } })
  } catch (error) {
    return publicErrorResponse({ status: error instanceof GatewayValidationError ? error.status : 500,
      code: 'FMU_CONNECTION_FAILED', message: 'The provider FMU connection could not be authorized.', error, context: 'fmu-connection' })
  }
}
