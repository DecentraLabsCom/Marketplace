import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import { createRateLimiter } from '@/utils/api/rateLimit'
import {
  GatewayValidationError,
  buildGatewayTargetUrl,
  resolveGatewayBaseUrl,
} from '@/utils/api/gatewayProxy'

const checkRate = createRateLimiter({ windowMs: 60_000, maxRequests: 20 })

/**
 * Base64url-encode an AAS identifier for BaSyx V2 REST path segments.
 */
function encodeAasId(id) {
  return Buffer.from(id).toString('base64url')
}

/**
 * GET /api/aas/package?labId=1[&gatewayUrl=https://...]
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
  const { limited } = checkRate(request)
  if (limited) {
    return NextResponse.json({ error: 'Too many requests - please try again later' }, { status: 429 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const labId = searchParams.get('labId')
    const gatewayUrl = searchParams.get('gatewayUrl')

    if (!labId) {
      return NextResponse.json({ error: 'Missing required parameter: labId' }, { status: 400 })
    }

    const gatewayBaseUrl = await resolveGatewayBaseUrl({
      labId,
      gatewayUrl,
      requireLabMatch: Boolean(labId && gatewayUrl),
    })

    const aasId = `urn:decentralabs:lab:${labId}`
    const packagePath = `/aas/shells/${encodeAasId(aasId)}/package`
    const packageUrl = buildGatewayTargetUrl(gatewayBaseUrl, packagePath)

    devLog.log(`[aas/package] Fetching AASX package from ${packageUrl}`)

    const pkgRes = await fetch(packageUrl, { cache: 'no-store' })

    if (pkgRes.status === 404) {
      return NextResponse.json({ notFound: true }, { status: 404 })
    }
    if (!pkgRes.ok) {
      const errBody = await pkgRes.text()
      devLog.error(`[aas/package] Package fetch error ${pkgRes.status}: ${errBody}`)
      return NextResponse.json(
        { error: `Gateway error (${pkgRes.status})` },
        { status: pkgRes.status },
      )
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
      return NextResponse.json({ error: error.message }, { status: error.status || 400 })
    }
    devLog.error('[aas/package] Proxy error:', error)
    return NextResponse.json({ error: error.message || 'Internal proxy error' }, { status: 500 })
  }
}
