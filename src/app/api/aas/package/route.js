import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import { createRateLimiter, createRateLimitResponse } from '@/utils/api/rateLimit'
import {
  GatewayValidationError,
  buildGatewayTargetUrl,
  gatewayFetch,
  resolveLabAccessGateway,
} from '@/utils/api/gatewayProxy'
import { publicErrorResponse } from '@/utils/security/publicError'

const checkRate = createRateLimiter({ operation: 'aas-package', windowMs: 60_000, maxRequests: 20 })

/**
 * Base64url-encode an AAS identifier for BaSyx V2 REST path segments.
 */
function encodeAasId(id) {
  return Buffer.from(id).toString('base64url')
}

/**
 * GET /api/aas/package?labId=1
 *
 * Proxy for the AASX package download from the provider's Gateway BaSyx instance.
 * Fetches GET /aas/shells/{aasIdEncoded}/package from the provider gateway and
 * streams the binary back to the Marketplace client.
 *
 * The AAS identifier is derived deterministically from labId:
 *   urn:decentralabs:lab:{labId}
 *
 * Returns:
 *   200  application/asset-administration-shell-package+xml  (the .aasx binary)
 *   404  { notFound: true }   — shell or package not found on the gateway
 *   400  { error: ... }       — missing / invalid parameters
 *   5xx  { error: ... }       — proxy or gateway error
 */
export async function GET(request) {
  const rateLimitResponse = createRateLimitResponse(await checkRate(request))
  if (rateLimitResponse) return rateLimitResponse

  try {
    const { searchParams } = new URL(request.url)
    const labId = searchParams.get('labId')

    if (!labId) {
      return NextResponse.json({ error: 'Missing required parameter: labId' }, { status: 400 })
    }

    const gatewayBaseUrl = await resolveLabAccessGateway({ labId })

    const aasId = `urn:decentralabs:lab:${labId}`
    const packagePath = `/aas/shells/${encodeAasId(aasId)}/package`
    const packageUrl = buildGatewayTargetUrl(gatewayBaseUrl, packagePath)

    devLog.log(`[aas/package] Fetching AASX package from ${packageUrl}`)

    const pkgRes = await gatewayFetch(packageUrl, { cache: 'no-store' })

    if (pkgRes.status === 404) {
      return NextResponse.json({ notFound: true }, { status: 404 })
    }
    if (pkgRes.status === 403) {
      return NextResponse.json(
        { notFound: true, reason: 'AAS is not available on this gateway (Lite mode)' },
        { status: 404 },
      )
    }
    if (!pkgRes.ok) {
      const errBody = await pkgRes.text()
      devLog.error(`[aas/package] Package fetch error ${pkgRes.status}`, { bodyBytes: errBody.length })
      return publicErrorResponse({
        status: Number.isInteger(pkgRes.status) ? pkgRes.status : 502,
        code: 'AAS_GATEWAY_REQUEST_FAILED',
        message: 'The laboratory package could not be downloaded.',
        error: new Error(`AAS package gateway returned ${pkgRes.status}`),
        context: 'aas-package-gateway',
      })
    }

    const aasx = await pkgRes.arrayBuffer()
    const filename = `lab-${labId}.aasx`

    return new Response(aasx, {
      status: 200,
      headers: {
        'Content-Type': 'application/asset-administration-shell-package+xml',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(aasx.byteLength),
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    if (error instanceof GatewayValidationError) {
      return publicErrorResponse({
        status: error.status || 400,
        code: 'INVALID_GATEWAY_REQUEST',
        message: 'The laboratory package request is invalid.',
        error,
        context: 'aas-package-validation',
      })
    }
    return publicErrorResponse({
      status: 500,
      code: 'AAS_REQUEST_FAILED',
      message: 'The laboratory package could not be downloaded.',
      error,
      context: 'aas-package',
    })
  }
}
