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

const checkRate = createRateLimiter({ windowMs: 60_000, maxRequests: 20 })

export async function POST(request) {
  const { limited } = checkRate(request)
  if (limited) {
    return NextResponse.json({ error: 'Too many requests - please try again later' }, { status: 429 })
  }

  try {
    const session = await requireAuth()
    requireProviderRole(session)

    const formData = await request.formData()
    const file = formData.get('file')
    const gatewayUrl = formData.get('gatewayUrl')

    if (!file) {
      return NextResponse.json({ error: 'Missing required field: file' }, { status: 400 })
    }
    if (!gatewayUrl) {
      return NextResponse.json({ error: 'Missing required field: gatewayUrl' }, { status: 400 })
    }

    if (!(await marketplaceJwtService.isConfigured())) {
      return NextResponse.json({ error: 'Marketplace JWT is not configured' }, { status: 503 })
    }

    const userId = session?.id || session?.eduPersonPrincipalName
    const affiliation = session?.affiliation || session?.schacHomeOrganization || ''
    if (!userId) {
      return NextResponse.json({ error: 'Missing SSO identity' }, { status: 401 })
    }

    const gatewayBaseUrl = normalizeGatewayBaseUrl(String(gatewayUrl))
    const marketplaceToken = await marketplaceJwtService.generateSamlAuthToken({
      userId,
      affiliation,
      scope: 'ssp:metadata',
      bookingInfoAllowed: false,
    })

    const backendForm = new FormData()
    backendForm.append('file', file, file.name || 'package.ssp')

    const targetUrl = `${gatewayBaseUrl}/assets/ssp/metadata`
    devLog.log(`[ssp/metadata] Requesting SSP metadata from ${targetUrl}`)

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${marketplaceToken}`,
      },
      body: backendForm,
      cache: 'no-store',
    })

    const responseText = await response.text()
    const data = responseText ? JSON.parse(responseText) : {}
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error || `Gateway returned ${response.status}` },
        { status: response.status },
      )
    }

    return NextResponse.json(data, { status: 200 })
  } catch (error) {
    if (error instanceof GatewayValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid gateway response' }, { status: 502 })
    }
    return handleGuardError(error)
  }
}
