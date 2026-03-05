import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
import { getPucFromSession } from '@/utils/webauthn/service'
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

async function resolveAuthEndpoint(labId) {
  if (!labId) {
    return null
  }
  const contract = await getContractInstance()
  const authURI = await contract.getLabAuthURI(Number(labId))
  return normalizeAuthBase(authURI || '')
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

    const { reservationKey, labId, authEndpoint } = body || {}
    if (!reservationKey && !labId) {
      throw new BadRequestError('Missing reservationKey or labId')
    }

    if (!session?.samlAssertion) {
      throw new BadRequestError('SSO session missing samlAssertion')
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
    const marketplaceToken = await marketplaceJwtService.generateSamlAuthToken({
      userId,
      affiliation,
      institutionalProviderWallet,
      puc,
      scope: 'booking:read',
      bookingInfoAllowed: true,
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
  resolveUserId,
  resolveAffiliation,
};
