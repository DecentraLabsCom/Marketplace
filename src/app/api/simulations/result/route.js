import { NextResponse } from 'next/server'
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

const checkRate = createRateLimiter({ operation: 'simulation-result', windowMs: 60_000, maxRequests: 20 })

/**
 * GET /api/simulations/result?simId=...&labId=...&gatewayUrl=...
 */
export async function GET(request) {
  try {
    const userBinding = await requireFmuUserBinding()
    const rateLimitResponse = createRateLimitResponse(await checkRate(request, { userId: userBinding }))
    if (rateLimitResponse) return rateLimitResponse
    const { searchParams } = new URL(request.url)
    const simId = searchParams.get('simId')
    const labId = searchParams.get('labId')
    const gatewayUrl = searchParams.get('gatewayUrl')
    const reservationKey = searchParams.get('reservationKey')

    if (!simId) {
      return NextResponse.json({ error: 'Missing simId' }, { status: 400 })
    }
    if (!labId) {
      return NextResponse.json({ error: 'Missing labId' }, { status: 400 })
    }

    const gatewayBaseUrl = await resolveLabAccessGateway({ labId, gatewayUrl, requireLabMatch: true })
    const targetUrl = buildGatewayTargetUrl(gatewayBaseUrl, `/fmu/api/v1/simulations/${encodeURIComponent(simId)}/result`)
    const gatewayHeaders = resolveFmuGatewayHeaders(request, {
      labId,
      reservationKey,
      gatewayOrigin: gatewayBaseUrl,
      userBinding,
    })

    const gatewayRes = await gatewayFetch(targetUrl, {
      headers: {
        ...gatewayHeaders,
      },
      cache: 'no-store',
    })

    if (!gatewayRes.ok) {
      const errBody = await gatewayRes.text()
      devLog.error(`[simulations/result] Gateway returned ${gatewayRes.status}`, { bodyBytes: errBody.length })
      return publicErrorResponse({
        status: gatewayRes.status,
        code: 'GATEWAY_REQUEST_FAILED',
        message: 'The simulation result could not be retrieved.',
        error: new Error(`Gateway returned ${gatewayRes.status}`),
        context: 'simulations-result-gateway',
      })
    }

    const data = await gatewayRes.json()
    return NextResponse.json(data, { status: 200 })
  } catch (error) {
    if (error instanceof HttpError) return handleGuardError(error, request)
    if (error instanceof GatewayValidationError) {
      return publicErrorResponse({
        status: error.status || 400,
        code: 'INVALID_GATEWAY_REQUEST',
        message: 'The simulation result parameters are invalid.',
        error,
        context: 'simulations-result-validation',
      })
    }
    return publicErrorResponse({
      status: 500,
      code: 'SIMULATION_RESULT_FAILED',
      message: 'The simulation result could not be retrieved.',
      error,
      context: 'simulations-result',
    })
  }
}

