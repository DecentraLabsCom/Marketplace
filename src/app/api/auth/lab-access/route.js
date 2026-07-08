import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { resolveInstitutionalBackendUrl } from '@/utils/onboarding/institutionalBackend'
import { getPucFromSession } from '@/utils/webauthn/service'
import { keccak256, toUtf8Bytes } from 'ethers'
import {
  BadRequestError,
  handleGuardError,
  requireAuth,
} from '@/utils/auth/guards'

function normalizeAuthBase(authEndpoint) {
  if (!authEndpoint || typeof authEndpoint !== 'string') {
    return null
  }
  const trimmed = authEndpoint.endsWith('/') ? authEndpoint.slice(0, -1) : authEndpoint
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return null
  }
  if (!trimmed.endsWith('/auth')) {
    return null
  }
  return trimmed
}

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

async function resolveAuthEndpoint(labId) {
  if (!labId) {
    return null
  }
  const contract = await getContractInstance()
  const authURI = await contract.getLabAuthURI(Number(labId))
  return normalizeAuthBase(authURI || '')
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

function resolveUserId(session) {
  return session?.id || session?.eduPersonPrincipalName || null
}

function resolveAffiliation(session) {
  return session?.affiliation || session?.schacHomeOrganization || null
}

export async function POST(req) {
  try {
    const session = await requireAuth()
    const body = await req.json().catch(() => ({}))
    const { labId, reservationKey, authEndpoint } = body || {}
    const includeBookingInfo = body?.includeBookingInfo !== false

    if (includeBookingInfo && !labId && !reservationKey) {
      throw new BadRequestError('Missing labId or reservationKey')
    }

    if (!session?.samlAssertion) {
      throw new BadRequestError('Missing SSO session')
    }

    const authBase = normalizeAuthBase(authEndpoint) || (await resolveAuthEndpoint(labId))
    if (!authBase) {
      throw new BadRequestError('Missing or invalid auth endpoint')
    }

    if (!(await marketplaceJwtService.isConfigured())) {
      throw new BadRequestError('Marketplace JWT is not configured')
    }

    const userId = resolveUserId(session)
    const affiliation = resolveAffiliation(session)
    if (!userId || !affiliation) {
      throw new BadRequestError('Missing SSO identity data')
    }

    let institutionalProviderWallet
    try {
      institutionalProviderWallet = await resolveInstitutionWallet(affiliation)
    } catch (error) {
      throw new BadRequestError(error.message)
    }
    if (!institutionalProviderWallet) {
      throw new BadRequestError('Institution wallet not registered')
    }

    const puc = getPucFromSession(session) || undefined
    const samlAssertionHash = computeSamlAssertionHash(session.samlAssertion)

    const marketplaceToken = await marketplaceJwtService.generateSamlAuthToken({
      userId,
      affiliation,
      institutionalProviderWallet,
      puc,
      scope: 'booking:read',
      bookingInfoAllowed: true,
      purpose: 'lab_access',
      reservationKey,
      labId,
      samlAssertionHash,
    })

    if (!includeBookingInfo) {
      const response = await fetch(`${authBase}/saml-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketplaceToken,
          samlAssertion: session.samlAssertion,
          timestamp: Math.floor(Date.now() / 1000),
        }),
      })

      const responseText = await response.text()
      if (!response.ok) {
        devLog.error('SSO lab access failed:', response.status, responseText)
        return NextResponse.json(
          { error: 'SSO lab access failed', details: responseText },
          { status: response.status },
        )
      }

      const data = responseText ? JSON.parse(responseText) : {}
      return NextResponse.json(data, { status: 200 })
    }

    const consumerBackendBase = await resolveInstitutionalBackendUrl(affiliation)
    if (!consumerBackendBase) {
      throw new BadRequestError('Institution backend not registered')
    }

    const checkInPayload = {
      marketplaceToken,
      samlAssertion: session.samlAssertion,
      reservationKey,
      labId,
      institutionalProviderWallet,
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

    const providerPayload = {
      marketplaceToken,
      reservationKey,
      labId,
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
    return NextResponse.json(data, { status: 200 })
  } catch (error) {
    return handleGuardError(error)
  }
}
