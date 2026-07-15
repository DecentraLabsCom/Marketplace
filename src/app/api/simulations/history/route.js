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

const checkRate = createRateLimiter({ operation: 'simulation-history', windowMs: 60_000, maxRequests: 30 })

/**
 * GET /api/simulations/history?labId=xxx&gatewayUrl=yyy&limit=20&offset=0
 */
export async function GET(request) {
  try {
    const userBinding = await requireFmuUserBinding()
    const rateLimitResponse = createRateLimitResponse(await checkRate(request, { userId: userBinding }))
    if (rateLimitResponse) return rateLimitResponse
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
      devLog.error(`[simulations/history] Gateway returned ${gatewayRes.status}`, { bodyBytes: errBody.length })
      return publicErrorResponse({
        status: gatewayRes.status,
        code: 'GATEWAY_REQUEST_FAILED',
        message: 'Simulation history could not be retrieved.',
        error: new Error(`Gateway returned ${gatewayRes.status}`),
        context: 'simulations-history-gateway',
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
        message: 'Simulation history parameters are invalid.',
        error,
        context: 'simulations-history-validation',
      })
    }
    return publicErrorResponse({
      status: 500,
      code: 'SIMULATION_HISTORY_FAILED',
      message: 'Simulation history could not be retrieved.',
      error,
      context: 'simulations-history',
    })
  }
}
