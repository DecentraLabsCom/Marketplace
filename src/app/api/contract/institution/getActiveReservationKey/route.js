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
  getSessionPuc,
  resolveInstitutionAddressFromSession,
} from '../../utils/institutionSession'
import {
  BadRequestError,
  handleGuardError,
  requireAuth,
} from '@/utils/auth/guards'

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

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
    if (
      (error instanceof BadRequestError || error?.code === 'BAD_REQUEST') &&
      typeof error?.message === 'string' &&
      (error.message.includes('affiliation domain') || error.message.includes('Institution not registered'))
    ) {
      if (process.env.NEXT_PUBLIC_ENABLE_MOCK_SSO === 'true') {
        return Response.json(
          { reservationKey: '0x0000000000000000000000000000000000000000000000000000000000mock01', hasActiveReservation: true, institutionAddress: '0x3D3D82982FC4B73cFc5913d2297762FdCeeC0965', puc: 'mock-puc', labId: 1, institutionDomain: 'mock.edu' },
          { status: 200 }
        )
      }
      return Response.json(
        { reservationKey: ZERO_BYTES32, hasActiveReservation: false, institutionAddress: null, puc: null, labId: null, institutionDomain: null },
        { status: 200 }
      )
    }

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
