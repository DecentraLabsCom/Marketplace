import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import { createRateLimiter } from '@/utils/api/rateLimit'
import { HttpError, handleGuardError } from '@/utils/auth/guards'
import {
  GatewayValidationError,
  buildGatewayTargetUrl,
  gatewayFetch,
  resolveLabAccessGateway,
} from '@/utils/api/gatewayProxy'
import { requireFmuUserBinding, resolveFmuGatewayHeaders } from '@/utils/auth/fmuGatewayContext'

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
    const userBinding = await requireFmuUserBinding()
    const { searchParams } = new URL(request.url)
    const gatewayUrl = searchParams.get('gatewayUrl')
    const labId = searchParams.get('labId')
    const reservationKey = searchParams.get('reservationKey')
    const limit = searchParams.get('limit') || '20'
    const offset = searchParams.get('offset') || '0'

    if (!labId) {
      return NextResponse.json({ error: 'Missing labId' }, { status: 400 })
    }

    const gatewayBaseUrl = await resolveLabAccessGateway({ labId, gatewayUrl, requireLabMatch: true })
    const targetUrl = buildGatewayTargetUrl(gatewayBaseUrl, '/fmu/api/v1/simulations/history', {
      labId,
      limit,
      offset,
    })
    const gatewayHeaders = resolveFmuGatewayHeaders(request, {
      labId,
      reservationKey,
      gatewayOrigin: gatewayBaseUrl,
      userBinding,
    })

    devLog.log(`[simulations/history] Proxying to ${targetUrl}`)

    const gatewayRes = await gatewayFetch(targetUrl, {
      headers: {
        ...gatewayHeaders,
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
    if (error instanceof HttpError) return handleGuardError(error)
    if (error instanceof GatewayValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status || 400 })
    }
    devLog.error('[simulations/history] Proxy error:', error)
    return NextResponse.json({ error: error.message || 'Internal proxy error' }, { status: 500 })
  }
}
