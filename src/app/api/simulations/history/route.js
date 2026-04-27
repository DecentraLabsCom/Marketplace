import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import { createRateLimiter } from '@/utils/api/rateLimit'
import {
  GatewayValidationError,
  buildGatewayTargetUrl,
  extractBearerHeader,
  resolveGatewayBaseUrl,
} from '@/utils/api/gatewayProxy'

const checkRate = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

/**
 * GET /api/simulations/history?labId=xxx&gatewayUrl=yyy&limit=20&offset=0
 */
export async function GET(request) {
  const { limited } = checkRate(request)
  if (limited) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const gatewayUrl = searchParams.get('gatewayUrl')
    const labId = searchParams.get('labId')
    const limit = searchParams.get('limit') || '20'
    const offset = searchParams.get('offset') || '0'

    if (!labId) {
      return NextResponse.json({ error: 'Missing labId' }, { status: 400 })
    }

    const gatewayBaseUrl = await resolveGatewayBaseUrl({ labId, gatewayUrl, requireLabMatch: true })
    const targetUrl = buildGatewayTargetUrl(gatewayBaseUrl, '/fmu/api/v1/simulations/history', {
      labId,
      limit,
      offset,
    })
    const authorization = extractBearerHeader(request)

    devLog.log(`[simulations/history] Proxying to ${targetUrl}`)

    const gatewayRes = await fetch(targetUrl, {
      headers: {
        ...(authorization ? { Authorization: authorization } : {}),
      },
      cache: 'no-store',
    })

    if (!gatewayRes.ok) {
      const errBody = await gatewayRes.text()
      devLog.error(`[simulations/history] Gateway returned ${gatewayRes.status}: ${errBody}`)
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
    devLog.error('[simulations/history] Proxy error:', error)
    return NextResponse.json({ error: error.message || 'Internal proxy error' }, { status: 500 })
  }
}
