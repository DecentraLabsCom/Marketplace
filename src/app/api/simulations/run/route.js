import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import { createRateLimiter } from '@/utils/api/rateLimit'
import {
  GatewayValidationError,
  buildGatewayTargetUrl,
  extractBearerHeader,
  resolveGatewayBaseUrl,
} from '@/utils/api/gatewayProxy'

const checkRate = createRateLimiter({ windowMs: 60_000, maxRequests: 10 })

/**
 * POST /api/simulations/run
 *
 * Proxies simulation execution requests to the Lab Gateway FMU runner.
 * Expects JSON body: { labId, reservationKey, parameters, options, gatewayUrl? }
 */
export async function POST(request) {
  const { limited } = checkRate(request)
  if (limited) {
    return NextResponse.json({ error: 'Too many requests - please try again later' }, { status: 429 })
  }

  try {
    const body = await request.json()
    const { labId, reservationKey, parameters, options, gatewayUrl } = body

    if (!labId) {
      return NextResponse.json({ error: 'Missing required field: labId' }, { status: 400 })
    }

    const gatewayBaseUrl = await resolveGatewayBaseUrl({ labId, gatewayUrl, requireLabMatch: true })
    const targetUrl = buildGatewayTargetUrl(gatewayBaseUrl, '/fmu/api/v1/simulations/run')

    const authorization = extractBearerHeader(request)

    devLog.log(`[simulations/run] Proxying to ${targetUrl} for lab ${labId}`)

    const gatewayRes = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify({ labId, reservationKey, parameters, options }),
      cache: 'no-store',
    })

    if (!gatewayRes.ok) {
      const errBody = await gatewayRes.text()
      devLog.error(`[simulations/run] Gateway returned ${gatewayRes.status}: ${errBody}`)
      return NextResponse.json(
        { error: `Gateway error (${gatewayRes.status})`, details: errBody },
        { status: gatewayRes.status },
      )
    }

    const data = await gatewayRes.json()
    return NextResponse.json(data, { status: 200 })
  } catch (error) {
    if (error instanceof GatewayValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status || 400 })
    }
    devLog.error('[simulations/run] Proxy error:', error)
    return NextResponse.json({ error: error.message || 'Internal proxy error' }, { status: 500 })
  }
}
