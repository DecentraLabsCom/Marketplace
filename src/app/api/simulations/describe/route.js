import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import { createRateLimiter } from '@/utils/api/rateLimit'
import {
  GatewayValidationError,
  buildGatewayTargetUrl,
  extractBearerHeader,
  resolveGatewayBaseUrl,
} from '@/utils/api/gatewayProxy'

const checkRate = createRateLimiter({ windowMs: 60_000, maxRequests: 20 })

/**
 * GET /api/simulations/describe?fmuFileName=xxx&gatewayUrl=yyy&labId=zzz
 */
export async function GET(request) {
  const { limited } = checkRate(request)
  if (limited) {
    return NextResponse.json({ error: 'Too many requests - please try again later' }, { status: 429 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const fmuFileName = searchParams.get('fmuFileName')
    const gatewayUrl = searchParams.get('gatewayUrl')
    const labId = searchParams.get('labId')

    if (!fmuFileName) {
      return NextResponse.json({ error: 'Missing required parameter: fmuFileName' }, { status: 400 })
    }

    const gatewayBaseUrl = await resolveGatewayBaseUrl({
      labId,
      gatewayUrl,
      requireLabMatch: Boolean(labId),
    })

    const targetUrl = buildGatewayTargetUrl(gatewayBaseUrl, '/fmu/api/v1/simulations/describe', {
      fmuFileName,
    })

    const authorization = extractBearerHeader(request)

    devLog.log(`[simulations/describe] Proxying to ${targetUrl}`)

    const gatewayRes = await fetch(targetUrl, {
      headers: {
        ...(authorization ? { Authorization: authorization } : {}),
      },
      cache: 'no-store',
    })

    if (!gatewayRes.ok) {
      const errBody = await gatewayRes.text()
      devLog.error(`[simulations/describe] Gateway returned ${gatewayRes.status}: ${errBody}`)
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
    devLog.error('[simulations/describe] Proxy error:', error)
    return NextResponse.json({ error: error.message || 'Internal proxy error' }, { status: 500 })
  }
}
