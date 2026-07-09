import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { getPucFromSession } from '@/utils/webauthn/service'
import { getStableUserIdModeFromSession } from '@/utils/auth/puc'
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

async function resolveAuthEndpoint(labId, authEndpoint) {
  if (!labId) {
    throw new BadRequestError('labId is required to verify auth endpoint')
  }
  try {
    const gatewayBase = await resolveGatewayBaseUrl({
      labId,
      gatewayUrl: authEndpoint,
      requireLabMatch: true,
    })
    return `${gatewayBase}/auth`
  } catch (error) {
    if (error instanceof GatewayValidationError) {
      throw new BadRequestError(error.message)
    }
    throw error
  }
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

async function resolveInstitutionWallet(domain) {
  const normalized = normalizeOrganizationDomain(domain)
  const contract = await getContractInstance()
  const wallet = await contract.resolveSchacHomeOrganization(normalized)
  if (!wallet || wallet === '0x0000000000000000000000000000000000000000') {
    return null
  }
  return wallet.toLowerCase()
}

function resolveAffiliation(session) {
  return session?.affiliation || session?.schacHomeOrganization || null
}

function computeSamlAssertionHash(samlAssertion) {
  return keccak256(toUtf8Bytes(samlAssertion))
}

export async function POST(req) {
  try {
    const session = await requireAuth()
    const body = await req.json().catch(() => ({}))

    const { reservationKey, labId, authEndpoint } = body || {}
    if (!reservationKey && !labId) {
      throw new BadRequestError('Missing reservationKey or labId')
    }

    if (!session?.samlAssertion) {
      throw new BadRequestError('SSO session missing samlAssertion')
    }

    const authBase = await resolveAuthEndpoint(labId, authEndpoint)
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

    let institutionalProviderWallet
    try {
      institutionalProviderWallet = await resolveInstitutionWallet(affiliation)
    } catch (error) {
      throw new BadRequestError(error.message)
    }
    if (!institutionalProviderWallet) {
      throw new BadRequestError('Institution wallet not registered')
    }

    const samlAssertionHash = computeSamlAssertionHash(session.samlAssertion)
    const marketplaceToken = await marketplaceJwtService.generateSamlAuthToken({
      puc,
      affiliation,
      institutionalProviderWallet,
      scope: 'booking:read',
      bookingInfoAllowed: true,
      purpose: 'lab_access',
      reservationKey,
      labId,
      samlAssertionHash,
      stableUserIdMode: getStableUserIdModeFromSession(session),
    })

    const payload = {
      marketplaceToken,
      samlAssertion: session.samlAssertion,
      reservationKey,
      labId,
      puc,
    }

    const response = await fetch(`${authBase}/checkin-institutional`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const responseText = await response.text()
    if (!response.ok) {
      devLog.error('Institutional check-in failed:', response.status, responseText)
      return NextResponse.json(
        { error: 'Institutional check-in failed', details: responseText },
        { status: response.status }
      )
    }

    const data = responseText ? JSON.parse(responseText) : {}
    return NextResponse.json(data, { status: 200 })
  } catch (error) {
    return handleGuardError(error)
  }
}

// helper exports for unit testing
export {
  normalizeOrganizationDomain,
  resolveInstitutionWallet,
  resolveAffiliation,
};
