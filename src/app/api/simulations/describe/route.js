import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import { createRateLimiter } from '@/utils/api/rateLimit'
import {
  GatewayValidationError,
  buildGatewayTargetUrl,
  extractBearerHeader,
  gatewayFetch,
  resolveLabAccessGateway,
} from '@/utils/api/gatewayProxy'
import { publicErrorResponse } from '@/utils/security/publicError'

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

    const gatewayBaseUrl = await resolveLabAccessGateway({
      labId,
      gatewayUrl,
      requireLabMatch: Boolean(labId),
    })

    const targetUrl = buildGatewayTargetUrl(gatewayBaseUrl, '/fmu/api/v1/simulations/describe', {
      fmuFileName,
    })

    const authorization = extractBearerHeader(request)

    devLog.log(`[simulations/describe] Proxying to ${targetUrl}`)

    const gatewayRes = await gatewayFetch(targetUrl, {
      headers: {
        ...(authorization ? { Authorization: authorization } : {}),
      },
      cache: 'no-store',
    })

    if (!gatewayRes.ok) {
      const errBody = await gatewayRes.text()
      devLog.error(`[simulations/describe] Gateway returned ${gatewayRes.status}`, { bodyBytes: errBody.length })
      return publicErrorResponse({
        status: gatewayRes.status,
        code: 'GATEWAY_REQUEST_FAILED',
        message: 'The simulation model could not be described.',
        error: new Error(`Gateway returned ${gatewayRes.status}`),
        context: 'simulations-describe-gateway',
      })
    }

    const data = await gatewayRes.json()
    return NextResponse.json(data, { status: 200 })
  } catch (error) {
    if (error instanceof GatewayValidationError) {
      return publicErrorResponse({
        status: error.status || 400,
        code: 'INVALID_GATEWAY_REQUEST',
        message: 'The simulation description parameters are invalid.',
        error,
        context: 'simulations-describe-validation',
      })
    }
    return publicErrorResponse({
      status: 500,
      code: 'SIMULATION_DESCRIBE_FAILED',
      message: 'The simulation model could not be described.',
      error,
      context: 'simulations-describe',
    })
  }
}
