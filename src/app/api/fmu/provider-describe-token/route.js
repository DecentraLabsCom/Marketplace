import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'
import { createRateLimiter } from '@/utils/api/rateLimit'
import { GatewayValidationError, normalizeGatewayBaseUrl } from '@/utils/api/gatewayProxy'
import {
  handleGuardError,
  requireAuth,
  requireProviderRole,
} from '@/utils/auth/guards'

const checkRate = createRateLimiter({ windowMs: 60_000, maxRequests: 30 })

/**
 * GET /api/fmu/provider-describe-token?fmuFileName=X&gatewayUrl=Y
 *
 * Obtains a short-lived JWT from the gateway's blockchain-services that allows
 * calling the FMU describe endpoint for a specific FMU file. No SAML assertion
 * is required — authentication is proved by the active Marketplace SSO session.
 *
 * Returns { token, expiresIn } on success.
 */
export async function GET(request) {
  const { limited } = checkRate(request)
  if (limited) {
    return NextResponse.json({ error: 'Too many requests - please try again later' }, { status: 429 })
  }

  try {
    const session = await requireAuth()
    requireProviderRole(session)

    const { searchParams } = new URL(request.url)
    const fmuFileName = searchParams.get('fmuFileName')
    const gatewayUrl = searchParams.get('gatewayUrl')

    if (!fmuFileName) {
      return NextResponse.json({ error: 'Missing required parameter: fmuFileName' }, { status: 400 })
    }
    if (!gatewayUrl) {
      return NextResponse.json({ error: 'Missing required parameter: gatewayUrl' }, { status: 400 })
    }

    if (!(await marketplaceJwtService.isConfigured())) {
      return NextResponse.json({ error: 'Marketplace JWT is not configured' }, { status: 503 })
    }

    const userId = session?.id || session?.eduPersonPrincipalName
    const affiliation = session?.affiliation || session?.schacHomeOrganization || ''
    if (!userId) {
      return NextResponse.json({ error: 'Missing SSO identity' }, { status: 401 })
    }

    const gatewayBaseUrl = normalizeGatewayBaseUrl(gatewayUrl)
    const authBase = `${gatewayBaseUrl}/auth`

    const marketplaceToken = await marketplaceJwtService.generateSamlAuthToken({
      userId,
      affiliation,
      scope: 'fmu:describe',
      bookingInfoAllowed: false,
    })

    devLog.log(`[fmu/provider-describe-token] Requesting describe token from ${authBase}/fmu/provider-describe-token`)

    const tokenRes = await fetch(`${authBase}/fmu/provider-describe-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${marketplaceToken}`,
      },
      body: JSON.stringify({ fmuFileName }),
    })

    const responseText = await tokenRes.text()
    if (!tokenRes.ok) {
      devLog.error(`[fmu/provider-describe-token] Auth service returned ${tokenRes.status}: ${responseText}`)
      return NextResponse.json(
        { error: `Auth service returned ${tokenRes.status}` },
        { status: tokenRes.status },
      )
    }

    const data = responseText ? JSON.parse(responseText) : {}
    return NextResponse.json(data, { status: 200 })
  } catch (error) {
    if (error instanceof GatewayValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return handleGuardError(error)
  }
}
