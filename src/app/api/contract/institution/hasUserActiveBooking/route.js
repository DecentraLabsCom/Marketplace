/**
 * API endpoint for checking if institutional user has active booking
 * Returns whether an institutional user (identified by PUC) has an active reservation
 * 
 * Calls: hasInstitutionalUserActiveBooking(institutionalProvider, puc)
 * 
 * @security Protected - requires authenticated session
 */

import { getContractInstance } from '../../utils/contractInstance'
import {
  BadRequestError,
  handleGuardError,
  requireAuth,
} from '@/utils/auth/guards'
import { isAddress } from 'viem'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

function normalizeOrganizationDomain(domain) {
  if (!domain || typeof domain !== 'string') {
    throw new BadRequestError('SSO session missing affiliation domain')
  }

  const input = domain.trim()
  if (input.length < 3 || input.length > 255) {
    throw new BadRequestError('Invalid organization domain length')
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
      throw new BadRequestError('Invalid character in organization domain')
    }

    normalized += ch
  }

  return normalized
}

function getSessionPuc(session) {
  const puc = session?.personalUniqueCode || session?.schacPersonalUniqueCode

  if (!puc || typeof puc !== 'string' || puc.trim() === '') {
    throw new BadRequestError('SSO session missing personalUniqueCode')
  }

  return puc.trim()
}

async function resolveInstitutionAddressFromSession(session, contract) {
  const affiliationDomain = session?.affiliation || session?.schacHomeOrganization

  const normalizedDomain = normalizeOrganizationDomain(affiliationDomain)
  const wallet = await contract.resolveSchacHomeOrganization(normalizedDomain)
  const lowerWallet = wallet?.toLowerCase?.() || wallet

  if (!lowerWallet || lowerWallet === ZERO_ADDRESS) {
    throw new BadRequestError('Institution not registered for current session domain')
  }

  if (!isAddress(lowerWallet)) {
    throw new BadRequestError('Resolved institution address is invalid')
  }

  return { institutionAddress: lowerWallet, normalizedDomain }
}

/**
 * Checks if institutional user has active booking
 * Derives institution wallet and puc from authenticated session
 * @returns {Response} JSON response with active booking status
 */
export async function GET() {
  try {
    const session = await requireAuth()
    const contract = await getContractInstance()

    const { institutionAddress, normalizedDomain } =
      await resolveInstitutionAddressFromSession(session, contract)
    const puc = getSessionPuc(session)

    const hasActiveBooking = await contract.hasInstitutionalUserActiveBooking(
      institutionAddress,
      puc,
    )

    console.log(
      `🔍 Checking active institutional booking for PUC: ${puc.slice(0, 8)}... at institution ${institutionAddress.slice(0, 6)}...${institutionAddress.slice(-4)} (${normalizedDomain})`,
    )

    console.log(`✅ Active booking check complete: ${hasActiveBooking}`)

    return Response.json(
      {
        hasActiveBooking: Boolean(hasActiveBooking),
        institutionAddress,
        puc,
        institutionDomain: normalizedDomain,
      },
      { status: 200 },
    )
  } catch (error) {
    if (error instanceof BadRequestError) {
      return handleGuardError(error)
    }

    console.error('❌ Error checking active booking:', error)

    return Response.json(
      {
        error: 'Failed to check active booking',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 },
    )
  }
}
