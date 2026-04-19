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
 * POST /api/simulations/stream
 */
export async function POST(request) {
  const { limited } = checkRate(request)
  if (limited) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const body = await request.json()
    const { labId, gatewayUrl } = body

    if (!labId) {
      return new Response(JSON.stringify({ error: 'Missing required field: labId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const gatewayBaseUrl = await resolveGatewayBaseUrl({ labId, gatewayUrl, requireLabMatch: true })
    const targetUrl = buildGatewayTargetUrl(gatewayBaseUrl, '/fmu/api/v1/simulations/stream')
    const authorization = extractBearerHeader(request)

    devLog.log(`[simulations/stream] Proxying to ${targetUrl} for lab ${labId}`)

    const gatewayRes = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authorization ? { Authorization: authorization } : {}),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })

    if (!gatewayRes.ok) {
      const errBody = await gatewayRes.text()
      devLog.error(`[simulations/stream] Gateway returned ${gatewayRes.status}: ${errBody}`)
      return new Response(JSON.stringify({ error: `Gateway error (${gatewayRes.status})`, details: errBody }), {
        status: gatewayRes.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(gatewayRes.body, {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
    })
  } catch (error) {
    if (error instanceof GatewayValidationError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.status || 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    devLog.error('[simulations/stream] Proxy error:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal proxy error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
