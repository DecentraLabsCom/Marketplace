import devLog from '@/utils/dev/logger'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'
import { HttpError, handleGuardError } from '@/utils/auth/guards'
import {
  GatewayValidationError,
  buildGatewayTargetUrl,
  gatewayFetch,
  resolveLabAccessGateway,
} from '@/utils/api/gatewayProxy'
import { requireFmuUserBinding, resolveFmuGatewayHeaders } from '@/utils/auth/fmuGatewayContext'
import { publicErrorResponse } from '@/utils/security/publicError'

const checkRate = createRateLimiter({ operation: 'simulation-stream', windowMs: 60_000, maxRequests: 10 })

/**
 * POST /api/simulations/stream
 */
export async function POST(request) {
  try {
    const userBinding = await requireFmuUserBinding()
    const rateLimitResponse = createRateLimitResponse(await checkRate(request, { userId: userBinding }))
    if (rateLimitResponse) return rateLimitResponse
    const body = await request.json()
    const { labId, reservationKey, gatewayUrl } = body

    if (!labId) {
      return new Response(JSON.stringify({ error: 'Missing required field: labId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const gatewayBaseUrl = await resolveLabAccessGateway({ labId, gatewayUrl, requireLabMatch: true })
    const targetUrl = buildGatewayTargetUrl(gatewayBaseUrl, '/fmu/api/v1/simulations/stream')
    const gatewayHeaders = resolveFmuGatewayHeaders(request, {
      labId,
      reservationKey,
      gatewayOrigin: gatewayBaseUrl,
      userBinding,
    })

    devLog.log(`[simulations/stream] Proxying to ${targetUrl} for lab ${labId}`)

    const gatewayRes = await gatewayFetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...gatewayHeaders,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })

    if (!gatewayRes.ok) {
      const errBody = await gatewayRes.text()
      devLog.error(`[simulations/stream] Gateway returned ${gatewayRes.status}`, { bodyBytes: errBody.length })
      return publicErrorResponse({
        status: gatewayRes.status,
        code: 'GATEWAY_REQUEST_FAILED',
        message: 'The simulation stream could not be opened.',
        error: new Error(`Gateway returned ${gatewayRes.status}`),
        context: 'simulations-stream-gateway',
      })
    }

    return new Response(gatewayRes.body, {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
    })
  } catch (error) {
    if (error instanceof HttpError) return handleGuardError(error, request)
    if (error instanceof GatewayValidationError) {
      return publicErrorResponse({
        status: error.status || 400,
        code: 'INVALID_GATEWAY_REQUEST',
        message: 'The simulation stream parameters are invalid.',
        error,
        context: 'simulations-stream-validation',
      })
    }
    return publicErrorResponse({
      status: 500,
      code: 'SIMULATION_STREAM_FAILED',
      message: 'The simulation stream could not be opened.',
      error,
      context: 'simulations-stream',
    })
  }
}
