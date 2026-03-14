import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import { createRateLimiter } from '@/utils/api/rateLimit'
import {
  GatewayValidationError,
  buildGatewayTargetUrl,
  resolveGatewayBaseUrl,
} from '@/utils/api/gatewayProxy'

const checkRate = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

/**
 * Base64url-encode an AAS / submodel ID for BaSyx V2 REST path segments.
 * BaSyx V2 encodes identifiers as base64url without padding characters.
 */
function encodeAasId(id) {
  return Buffer.from(id).toString('base64url')
}

/**
 * Extract a flat map of { idShort -> value } from a BaSyx V2 submodelElements array.
 * Only handles top-level Property elements (modelType === "Property").
 */
function extractProperties(submodelElements) {
  if (!Array.isArray(submodelElements)) return {}
  return submodelElements.reduce((acc, el) => {
    if (el?.modelType === 'Property' && el.idShort) {
      acc[el.idShort] = el.value ?? ''
    }
    return acc
  }, {})
}

/**
 * GET /api/aas/shell?labId=1[&gatewayUrl=https://...]
 *
 * Fetches the AAS shell and Nameplate submodel from the provider's Gateway BaSyx
 * instance. Both identifiers are derived deterministically from the labId:
 *   AAS shell:   urn:decentralabs:lab:{labId}
 *   Nameplate:   urn:decentralabs:lab:{labId}:sm:nameplate
 *
 * Returns 404 JSON { notFound: true } when the shell does not exist on the gateway
 * (e.g. provider has not deployed the AAS profile). Returns the combined payload:
 *   { shell, nameplate }
 * where `nameplate` is null if the provider has not yet synced the Nameplate submodel.
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

    const shellId = `urn:decentralabs:lab:${labId}`
    const nameplateId = `urn:decentralabs:lab:${labId}:sm:nameplate`

    const shellPath = `/aas/shells/${encodeAasId(shellId)}`
    const nameplatePath = `/aas/submodels/${encodeAasId(nameplateId)}`

    const shellUrl = buildGatewayTargetUrl(gatewayBaseUrl, shellPath)
    const nameplateUrl = buildGatewayTargetUrl(gatewayBaseUrl, nameplatePath)

    devLog.log(`[aas/shell] Fetching shell from ${shellUrl}`)

    // Fetch shell — if it returns 404, the lab has no AAS configured
    const shellRes = await fetch(shellUrl, { cache: 'no-store' })

    if (shellRes.status === 404) {
      return NextResponse.json({ notFound: true }, { status: 404 })
    }
    if (!shellRes.ok) {
      const errBody = await shellRes.text()
      devLog.error(`[aas/shell] Shell fetch error ${shellRes.status}: ${errBody}`)
      return NextResponse.json(
        { error: `Gateway error (${shellRes.status})` },
        { status: shellRes.status },
      )
    }

    const shell = await shellRes.json()

    // Fetch nameplate — best-effort, null if not present
    let nameplate = null
    try {
      devLog.log(`[aas/shell] Fetching nameplate from ${nameplateUrl}`)
      const npRes = await fetch(nameplateUrl, { cache: 'no-store' })
      if (npRes.ok) {
        const npData = await npRes.json()
        nameplate = extractProperties(npData?.submodelElements)
      }
    } catch (npErr) {
      devLog.warn('[aas/shell] Nameplate fetch failed (non-fatal):', npErr?.message)
    }

    return NextResponse.json({ shell, nameplate }, { status: 200 })
  } catch (error) {
    if (error instanceof GatewayValidationError) {
      return NextResponse.json({ error: error.message }, { status: error.status || 400 })
    }
    devLog.error('[aas/shell] Proxy error:', error)
    return NextResponse.json({ error: error.message || 'Internal proxy error' }, { status: 500 })
  }
}
