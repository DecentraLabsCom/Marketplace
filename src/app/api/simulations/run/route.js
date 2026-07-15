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

const checkRate = createRateLimiter({ operation: 'simulation-run', windowMs: 60_000, maxRequests: 10 })

/**
 * POST /api/simulations/run
 *
 * Proxies simulation execution requests to the Lab Gateway FMU runner.
 * Expects JSON body: { labId, reservationKey, parameters, options, gatewayUrl? }
 */
export async function POST(request) {
  try {
    const userBinding = await requireFmuUserBinding()
    const rateLimitResponse = createRateLimitResponse(await checkRate(request, { userId: userBinding }))
    if (rateLimitResponse) return rateLimitResponse
    const body = await request.json()
    const { labId, reservationKey, parameters, options, gatewayUrl } = body

    if (!labId) {
      return NextResponse.json({ error: 'Missing required field: labId' }, { status: 400 })
    }

    const gatewayBaseUrl = await resolveLabAccessGateway({ labId, gatewayUrl, requireLabMatch: true })
    const targetUrl = buildGatewayTargetUrl(gatewayBaseUrl, '/fmu/api/v1/simulations/run')

    const gatewayHeaders = resolveFmuGatewayHeaders(request, {
      labId,
      reservationKey,
      gatewayOrigin: gatewayBaseUrl,
      userBinding,
    })

    devLog.log(`[simulations/run] Proxying to ${targetUrl} for lab ${labId}`)

    const gatewayRes = await gatewayFetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...gatewayHeaders,
      },
      body: JSON.stringify({ labId, reservationKey, parameters, options }),
      cache: 'no-store',
    })

    if (!gatewayRes.ok) {
      const errBody = await gatewayRes.text()
      devLog.error(`[simulations/run] Gateway returned ${gatewayRes.status}`, { bodyBytes: errBody.length })
      return publicErrorResponse({
        status: gatewayRes.status,
        code: 'GATEWAY_REQUEST_FAILED',
        message: 'The simulation service could not complete the request.',
        error: new Error(`Gateway returned ${gatewayRes.status}`),
        context: 'simulations-run-gateway',
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
        message: 'The simulation request parameters are invalid.',
        error,
        context: 'simulations-run-validation',
      })
    }
    return publicErrorResponse({
      status: 500,
      code: 'SIMULATION_REQUEST_FAILED',
      message: 'The simulation request could not be completed.',
      error,
      context: 'simulations-run',
    })
  }
}
