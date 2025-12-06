/**
 * API endpoint for getting institutional user's active reservation key
 * Returns the active reservation key for an SSO user in a specific lab
 * 
 * Calls: getInstitutionalUserActiveReservationKey(institutionalProvider, puc, labId)
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

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

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
 * Gets the active reservation key for an institutional user in a specific lab
 * Derives institution wallet and puc from authenticated session; requires labId param
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.labId - Lab ID to check (required)
 * @returns {Response} JSON response with reservation key (or 0x0 if no active booking)
 */
export async function GET(request) {
  try {
    const session = await requireAuth()

    const url = new URL(request.url)
    const labId = url.searchParams.get('labId')

    if (!labId) {
      throw new BadRequestError('Missing labId parameter')
    }

    const labIdNum = parseInt(labId, 10)
    if (Number.isNaN(labIdNum) || labIdNum < 0) {
      throw new BadRequestError('Invalid labId format')
    }

    const contract = await getContractInstance()
    const { institutionAddress, normalizedDomain } =
      await resolveInstitutionAddressFromSession(session, contract)
    const puc = getSessionPuc(session)

    const reservationKey = await contract.getInstitutionalUserActiveReservationKey(
      institutionAddress,
      puc,
      labIdNum,
    )

    const reservationKeyStr = reservationKey?.toString() || ZERO_BYTES32
    const hasActiveReservation = reservationKeyStr !== ZERO_BYTES32

    console.log(
      `🔍 Getting active reservation key for PUC: ${puc.slice(0, 8)}... in lab ${labIdNum} at institution ${institutionAddress.slice(0, 6)}...${institutionAddress.slice(-4)} (${normalizedDomain})`,
    )

    console.log(
      `✅ Active reservation key: ${hasActiveReservation ? `${reservationKeyStr.slice(0, 10)}...` : 'none'}`,
    )

    return Response.json(
      {
        reservationKey: reservationKeyStr,
        hasActiveReservation,
        institutionAddress,
        puc,
        labId: labIdNum,
        institutionDomain: normalizedDomain,
      },
      { status: 200 },
    )
  } catch (error) {
    if (error instanceof BadRequestError) {
      return handleGuardError(error)
    }

    console.error('❌ Error getting active reservation key:', error)

    return Response.json(
      {
        error: 'Failed to get active reservation key',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 },
    )
  }
}
