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
const AASX_MEDIA_TYPE = 'application/asset-administration-shell-package+xml'
const ACCEPTED_AASX_MEDIA_TYPES = new Set([
  AASX_MEDIA_TYPE,
  'application/aasx+xml',
  'application/aas+zip',
])
const MAX_SUBMODEL_REFERENCES = 256
const MAX_IDENTIFIER_LENGTH = 2048

/**
 * Base64url-encode an AAS identifier for BaSyx V2 REST path segments.
 */
function encodeAasId(id) {
  return Buffer.from(id).toString('base64url')
}

/**
 * Get the identifiers of the submodels referenced by a shell. They must be
 * passed explicitly to BaSyx's serialization endpoint because serializing an
 * AAS identifier alone only includes the shell itself.
 */
function extractSubmodelIds(shell) {
  if (!Array.isArray(shell?.submodels)) return []

  return shell.submodels
    .flatMap((reference) => {
      if (!Array.isArray(reference?.keys)) return []
      const submodelKey = reference.keys.find(
        (key) => key?.type === 'Submodel' && typeof key.value === 'string',
      )
      if (!submodelKey || submodelKey.value.length > MAX_IDENTIFIER_LENGTH) return []
      return [submodelKey.value]
    })
    .slice(0, MAX_SUBMODEL_REFERENCES)
}

function buildSerializationUrl(gatewayBaseUrl, aasId, submodelIds) {
  const url = new URL(buildGatewayTargetUrl(gatewayBaseUrl, '/aas/serialization'))
  url.searchParams.set('aasIds', encodeAasId(aasId))
  url.searchParams.set('includeConceptDescriptions', 'true')
  submodelIds.forEach((submodelId) => {
    url.searchParams.append('submodelIds', encodeAasId(submodelId))
  })
  return url.toString()
}

function isZipArchive(bytes) {
  return bytes.length >= 4
    && bytes[0] === 0x50
    && bytes[1] === 0x4b
    && bytes[2] === 0x03
    && bytes[3] === 0x04
}

/**
 * GET /api/aas/package?labId=1
 *
 * Proxy for the AASX package download from the provider's Gateway BaSyx instance.
 * Fetches the shell first to discover its submodels, then asks BaSyx to generate
 * the AASX serialization from the server-side AAS data and streams the binary
 * back to the Marketplace client.
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
    const shellUrl = buildGatewayTargetUrl(
      gatewayBaseUrl,
      `/aas/shells/${encodeAasId(aasId)}`,
    )

    devLog.log(`[aas/package] Fetching shell from ${shellUrl}`)

    const shellRes = await gatewayFetch(shellUrl, { cache: 'no-store' })

    if (shellRes.status === 404) {
      return NextResponse.json({ notFound: true }, { status: 404 })
    }
    if (shellRes.status === 403) {
      return NextResponse.json(
        { notFound: true, reason: 'AAS is not available on this gateway (Lite mode)' },
        { status: 404 },
      )
    }
    if (!shellRes.ok) {
      const errBody = await shellRes.text()
      devLog.error(`[aas/package] Shell fetch error ${shellRes.status}`, { bodyBytes: errBody.length })
      return publicErrorResponse({
        status: Number.isInteger(shellRes.status) ? shellRes.status : 502,
        code: 'AAS_GATEWAY_REQUEST_FAILED',
        message: 'The laboratory package could not be downloaded.',
        error: new Error(`AAS gateway returned ${shellRes.status}`),
        context: 'aas-package-gateway',
      })
    }

    let shell
    try {
      shell = await shellRes.json()
    } catch (error) {
      return publicErrorResponse({
        status: 502,
        code: 'AAS_GATEWAY_REQUEST_FAILED',
        message: 'The laboratory package could not be downloaded.',
        error,
        context: 'aas-package-shell-json',
      })
    }

    const submodelIds = extractSubmodelIds(shell)
    const serializationUrl = buildSerializationUrl(gatewayBaseUrl, aasId, submodelIds)
    devLog.log(`[aas/package] Fetching AASX serialization from ${serializationUrl}`)

    const pkgRes = await gatewayFetch(serializationUrl, {
      cache: 'no-store',
      headers: { Accept: AASX_MEDIA_TYPE },
    })

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
      devLog.error(`[aas/package] Serialization fetch error ${pkgRes.status}`, { bodyBytes: errBody.length })
      return publicErrorResponse({
        status: Number.isInteger(pkgRes.status) ? pkgRes.status : 502,
        code: 'AAS_GATEWAY_REQUEST_FAILED',
        message: 'The laboratory package could not be downloaded.',
        error: new Error(`AAS serialization gateway returned ${pkgRes.status}`),
        context: 'aas-package-gateway',
      })
    }

    const contentType = (pkgRes.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase()
    if (!ACCEPTED_AASX_MEDIA_TYPES.has(contentType)) {
      devLog.error('[aas/package] Gateway returned a non-AASX success response', { contentType })
      return publicErrorResponse({
        status: 502,
        code: 'AAS_GATEWAY_REQUEST_FAILED',
        message: 'The laboratory package could not be downloaded.',
        error: new Error('AAS serialization response is not an AASX package'),
        context: 'aas-package-content-type',
      })
    }

    const aasx = await pkgRes.arrayBuffer()
    if (!isZipArchive(new Uint8Array(aasx))) {
      devLog.error('[aas/package] Gateway returned an invalid AASX archive')
      return publicErrorResponse({
        status: 502,
        code: 'AAS_GATEWAY_REQUEST_FAILED',
        message: 'The laboratory package could not be downloaded.',
        error: new Error('AAS serialization response is not a ZIP archive'),
        context: 'aas-package-archive',
      })
    }
    const filename = `lab-${labId}.aasx`

    return new Response(aasx, {
      status: 200,
      headers: {
        'Content-Type': AASX_MEDIA_TYPE,
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
