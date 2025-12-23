import { NextResponse } from 'next/server'
import devLog from '@/utils/dev/logger'
import marketplaceJwtService from '@/utils/auth/marketplaceJwt'
import { getContractInstance } from '@/app/api/contract/utils/contractInstance'
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
  return trimmed.endsWith('/auth') ? trimmed : `${trimmed}/auth`
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
  const lab = await contract.getLab(Number(labId))
  return normalizeAuthBase(lab?.base?.auth || '')
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
  return session?.userid || session?.uid || session?.id || session?.email || null
}

function resolveAffiliation(session) {
  return session?.affiliation || session?.schacHomeOrganization || session?.organizationName || null
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

    const puc = session.personalUniqueCode || session.schacPersonalUniqueCode || undefined

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
      labId,
      reservationKey,
      timestamp: Math.floor(Date.now() / 1000),
    }

    const response = await fetch(`${authBase}/saml-auth2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
  } catch (error) {
    return handleGuardError(error)
  }
}
