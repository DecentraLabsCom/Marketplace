import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { resolveInstitutionalBackendUrl } from '@/utils/onboarding/institutionalBackend'
import { getStableUserIdModeFromSession } from '@/utils/auth/puc'
import { getPucFromSession } from '@/utils/webauthn/service'
import { keccak256, toUtf8Bytes } from 'ethers'
import {
  BadRequestError,
  handleGuardError,
  requireAuth,
} from '@/utils/auth/guards'
import {
  GatewayValidationError,
  resolveGatewayBaseUrl,
} from '@/utils/api/gatewayProxy'

function normalizeOrganizationDomain(domain) {
  if (!domain || typeof domain !== 'string') {
    throw new Error('Organization domain is required')
  }

  const input = domain.trim()
  if (input.length < 3 || input.length > 255) {
    throw new Error('Invalid organization domain length')
  }

  let normalized = ''
  for (let i = 0; i < input.length; i += 1) {
    let code = input.charCodeAt(i)

    // Uppercase A-Z -> lowercase a-z
    if (code >= 0x41 && code <= 0x5a) {
      code += 32
    }

    const ch = String.fromCharCode(code)

    const isLower = code >= 0x61 && code <= 0x7a
    const isDigit = code >= 0x30 && code <= 0x39
    const isDash = ch === '-'
    const isDot = ch === '.'

    if (!isLower && !isDigit && !isDash && !isDot) {
      throw new Error('Invalid character in organization domain')
    }

    normalized += ch
  }

  return normalized
}

async function resolveAuthContext(labId, authEndpoint) {
  if (!labId) {
    throw new BadRequestError('labId is required to verify auth endpoint')
  }
  try {
    const gatewayBase = await resolveGatewayBaseUrl({
      labId,
      gatewayUrl: authEndpoint,
      requireLabMatch: true,
    })
    return {
      authBase: `${gatewayBase}/auth`,
      audience: gatewayBase,
    }
  } catch (error) {
    if (error instanceof GatewayValidationError) {
      throw new BadRequestError(error.message)
    }
    throw error
  }
}

async function resolveInstitutionWallet(domain) {
  const normalized = normalizeOrganizationDomain(domain)
  const contract = await getContractInstance()
  const wallet = await contract.resolveSchacHomeOrganization(normalized)
  if (!wallet || wallet === '0x0000000000000000000000000000000000000000') {
    return null
  }
  return wallet.toLowerCase()
}

function computeSamlAssertionHash(samlAssertion) {
  return keccak256(toUtf8Bytes(samlAssertion))
}

function buildBackendAudiences(targetAudience) {
  const fallbackAudience = process.env.SAML_AUTH_JWT_AUDIENCE || process.env.INTENTS_JWT_AUDIENCE || 'blockchain-services'
  return [...new Set([targetAudience, fallbackAudience].filter(Boolean))]
}

function normalizeBackendBase(endpoint) {
  try {
    const url = new URL(endpoint)
    const normalizedPath = url.pathname.replace(/\/(auth|api)\/?$/i, '').replace(/\/$/, '')
    return `${url.protocol}//${url.host}${normalizedPath}`.toLowerCase()
  } catch {
    return null
  }
}

function isSameBackend(consumerBackendBase, providerAuthBase) {
  const consumer = normalizeBackendBase(consumerBackendBase)
  const provider = normalizeBackendBase(providerAuthBase)
  return Boolean(consumer && provider && consumer === provider)
}

function resolveAffiliation(session) {
  return session?.affiliation || session?.schacHomeOrganization || null
}

async function issueLabAccessCode(authBase, authResponse, marketplaceToken) {
  if (!authResponse?.token || !authResponse?.labURL) {
    throw new Error('Authentication service returned an invalid access credential')
  }
  if (!marketplaceToken) {
    throw new Error('Marketplace authentication is required to issue an access code')
  }
  const response = await fetch(`${authBase}/access-code/issue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Marketplace-Authorization': `Bearer ${marketplaceToken}`,
    },
    body: JSON.stringify({ token: authResponse.token }),
  })
  const responseText = await response.text()
  if (!response.ok) {
    devLog.error('Access-code issuance failed:', response.status, responseText)
    throw new Error('Access-code issuance failed')
  }
  const data = responseText ? JSON.parse(responseText) : {}
  if (!data.accessCode || !data.labURL) {
    throw new Error('Access-code issuance returned an invalid response')
  }
  return { accessCode: data.accessCode, labURL: data.labURL }
}

function isGuacamoleAccess(authResponse) {
  try {
    return new URL(authResponse?.labURL).pathname.startsWith('/guacamole')
  } catch {
    return false
  }
}

export async function POST(req) {
  try {
    const session = await requireAuth()
    const body = await req.json().catch(() => ({}))
    const { labId, reservationKey, authEndpoint } = body || {}
    if (!labId && !reservationKey) {
      throw new BadRequestError('Missing labId or reservationKey')
    }

    if (!session?.samlAssertion) {
      throw new BadRequestError('Missing SSO session')
    }

    const { authBase, audience: providerAudience } = await resolveAuthContext(labId, authEndpoint)
    if (!authBase) {
      throw new BadRequestError('Missing or invalid auth endpoint')
    }

    if (!(await marketplaceJwtService.isConfigured())) {
      throw new BadRequestError('Marketplace JWT is not configured')
    }

    const puc = getPucFromSession(session)
    const affiliation = resolveAffiliation(session)
    if (!puc || !affiliation) {
      throw new BadRequestError('Missing SSO identity data')
    }

    let payerInstitutionWallet
    try {
      payerInstitutionWallet = await resolveInstitutionWallet(affiliation)
    } catch (error) {
      throw new BadRequestError(error.message)
    }
    if (!payerInstitutionWallet) {
      throw new BadRequestError('Institution wallet not registered')
    }

    const samlAssertionHash = computeSamlAssertionHash(session.samlAssertion)

    const commonTokenClaims = {
      puc,
      affiliation,
      payerInstitutionWallet,
      scope: 'booking:read',
      bookingInfoAllowed: true,
      purpose: 'lab_access',
      reservationKey,
      labId,
      samlAssertionHash,
      stableUserIdMode: getStableUserIdModeFromSession(session),
    }

    const consumerBackendBase = await resolveInstitutionalBackendUrl(affiliation)
    if (!consumerBackendBase) {
      throw new BadRequestError('Institution backend not registered')
    }

    if (isSameBackend(consumerBackendBase, authBase)) {
      const marketplaceToken = await marketplaceJwtService.generateSamlAuthToken({
        ...commonTokenClaims,
        audience: buildBackendAudiences(providerAudience),
      })
      const response = await fetch(`${authBase}/authorize-and-issue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketplaceToken,
          samlAssertion: session.samlAssertion,
          reservationKey,
          labId,
          timestamp: Math.floor(Date.now() / 1000),
        }),
      })
      const responseText = await response.text()
      if (!response.ok) {
        devLog.error('Combined access authorization failed:', response.status, responseText)
        return NextResponse.json(
          { error: 'Combined access authorization failed', details: responseText },
          { status: response.status },
        )
      }
      const authResponse = responseText ? JSON.parse(responseText) : {}
      const access = isGuacamoleAccess(authResponse)
        ? await issueLabAccessCode(authBase, authResponse, marketplaceToken)
        : authResponse
      return NextResponse.json(access, { status: 200 })
    }

    const consumerMarketplaceToken = await marketplaceJwtService.generateSamlAuthToken({
      ...commonTokenClaims,
      audience: buildBackendAudiences(consumerBackendBase),
    })

    const checkInPayload = {
      marketplaceToken: consumerMarketplaceToken,
      samlAssertion: session.samlAssertion,
      reservationKey,
      labId,
      payerInstitutionWallet,
      puc,
    }

    const checkInResponse = await fetch(`${consumerBackendBase}/auth/checkin-institutional`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(checkInPayload),
    })

    const checkInResponseText = await checkInResponse.text()
    if (!checkInResponse.ok) {
      devLog.error('Institutional access authorization failed:', checkInResponse.status, checkInResponseText)
      return NextResponse.json(
        { error: 'Institutional access authorization failed', details: checkInResponseText },
        { status: checkInResponse.status },
      )
    }
    const checkInData = checkInResponseText ? JSON.parse(checkInResponseText) : {}

    const providerMarketplaceToken = await marketplaceJwtService.generateSamlAuthToken({
      ...commonTokenClaims,
      audience: buildBackendAudiences(providerAudience),
    })

    const providerPayload = {
      marketplaceToken: providerMarketplaceToken,
      reservationKey,
      labId,
      accessAuthorizationTxHash: checkInData.txHash,
    }
    const response = await fetch(`${authBase}/access-credential`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(providerPayload),
    })

    const responseText = await response.text()
    if (!response.ok) {
      devLog.error('Provider access credential issuance failed:', response.status, responseText)
      return NextResponse.json(
        { error: 'Provider access credential issuance failed', details: responseText },
        { status: response.status },
      )
    }

    const data = responseText ? JSON.parse(responseText) : {}
    const access = isGuacamoleAccess(data)
      ? await issueLabAccessCode(authBase, data, providerMarketplaceToken)
      : data
    return NextResponse.json(access, { status: 200 })
  } catch (error) {
    return handleGuardError(error)
  }
}
