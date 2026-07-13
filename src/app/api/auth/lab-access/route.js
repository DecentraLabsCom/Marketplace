import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import {
  institutionalBackendFetch,
  resolveInstitutionalBackendUrl,
} from '@/utils/onboarding/institutionalBackend'
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
  gatewayFetch,
  resolveProviderAuthBackend,
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
    const gatewayBase = await resolveProviderAuthBackend({
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

const PROVIDER_CREDENTIAL_ATTEMPTS = 3
const MAX_RETRY_AFTER_MS = 5_000

function parseResponseJson(responseText) {
  if (!responseText) return {}
  try {
    return JSON.parse(responseText)
  } catch {
    return {}
  }
}

function isRetryableProviderPending(response, responseText) {
  return response.status === 503 && parseResponseJson(responseText).retryable === true
}

function retryAfterMilliseconds(response) {
  const raw = response.headers?.get?.('retry-after')
  if (!raw) return 1_000
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_RETRY_AFTER_MS, Math.ceil(seconds * 1_000))
  }
  const retryAt = Date.parse(raw)
  if (!Number.isFinite(retryAt)) return 1_000
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, retryAt - Date.now()))
}

async function issueProviderCredential(authBase, providerPayload) {
  for (let attempt = 1; attempt <= PROVIDER_CREDENTIAL_ATTEMPTS; attempt += 1) {
    const response = await gatewayFetch(`${authBase}/access-credential`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(providerPayload),
    })
    const responseText = await response.text()
    if (!isRetryableProviderPending(response, responseText) || attempt === PROVIDER_CREDENTIAL_ATTEMPTS) {
      return { response, responseText }
    }
    await new Promise((resolve) => setTimeout(resolve, retryAfterMilliseconds(response)))
  }
  throw new Error('Provider credential retry loop ended unexpectedly')
}

function providerFailureResponse(response, responseText, message) {
  devLog.error(`${message}:`, response.status, responseText)
  const retryAfter = response.headers?.get?.('retry-after')
  return NextResponse.json(
    { error: message, details: responseText },
    {
      status: response.status,
      ...(retryAfter ? { headers: { 'Retry-After': retryAfter } } : {}),
    },
  )
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
      const response = await gatewayFetch(`${authBase}/authorize-and-issue`, {
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
        const pending = parseResponseJson(responseText)
        if (!isRetryableProviderPending(response, responseText) || !pending.txHash) {
          return providerFailureResponse(response, responseText, 'Combined access authorization failed')
        }

        // The combined endpoint has already submitted the consumer check-in.
        // Continue only with credential issuance so that retrying cannot create
        // a second consumer-side authorization transaction.
        await new Promise((resolve) => setTimeout(resolve, retryAfterMilliseconds(response)))
        const { response: credentialResponse, responseText: credentialText } = await issueProviderCredential(
          authBase,
          {
            marketplaceToken,
            reservationKey: pending.reservationKey || reservationKey,
            labId,
            accessAuthorizationTxHash: pending.txHash,
          },
        )
        if (!credentialResponse.ok) {
          return providerFailureResponse(
            credentialResponse,
            credentialText,
            'Provider access credential issuance failed',
          )
        }
        return NextResponse.json(parseResponseJson(credentialText), { status: 200 })
      }
      const authResponse = parseResponseJson(responseText)
      return NextResponse.json(authResponse, { status: 200 })
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

    const checkInResponse = await institutionalBackendFetch(
      `${consumerBackendBase}/auth/checkin-institutional`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(checkInPayload),
      },
    )

    const checkInResponseText = await checkInResponse.text()
    if (!checkInResponse.ok) {
      devLog.error('Institutional access authorization failed:', checkInResponse.status, checkInResponseText)
      return NextResponse.json(
        { error: 'Institutional access authorization failed', details: checkInResponseText },
        { status: checkInResponse.status },
      )
    }
    const checkInData = parseResponseJson(checkInResponseText)

    const providerMarketplaceToken = await marketplaceJwtService.generateSamlAuthToken({
      ...commonTokenClaims,
      audience: buildBackendAudiences(providerAudience),
    })

    const providerPayload = {
      marketplaceToken: providerMarketplaceToken,
      reservationKey: checkInData.reservationKey || reservationKey,
      labId,
      accessAuthorizationTxHash: checkInData.txHash,
    }
    const { response, responseText } = await issueProviderCredential(authBase, providerPayload)
    if (!response.ok) {
      return providerFailureResponse(response, responseText, 'Provider access credential issuance failed')
    }

    const data = parseResponseJson(responseText)
    return NextResponse.json(data, { status: 200 })
  } catch (error) {
    return handleGuardError(error)
  }
}
