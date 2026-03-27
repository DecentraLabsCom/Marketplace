/**
 * API endpoint for getting institutional user's reservation key by index
 * Returns a specific reservation key from the user's reservation list
 * 
 * Calls: getInstitutionalUserReservationByIndex(institutionalProvider, puc, index)
 * 
 * @security Protected - requires authenticated session
 */

import { getContractInstance } from '../../utils/contractInstance'
import {
  resolveInstitutionAddressFromSession,
  getSessionPuc,
} from '../../utils/institutionSession'
import { BadRequestError, handleGuardError, requireAuth } from '@/utils/auth/guards'
import devLog from '@/utils/dev/logger'

/**
 * Gets a reservation key at a specific index for an institutional user
 * Derives institution wallet and puc from authenticated session; requires index param
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.index - Index in reservation list (required)
 * @returns {Response} JSON response with reservation key
 */
export async function GET(request) {
  try {
    const session = await requireAuth()

    const url = new URL(request.url)
    const indexParam = url.searchParams.get('index')

    if (indexParam === null || indexParam === undefined) {
      throw new BadRequestError('Missing index parameter')
    }

    const index = parseInt(indexParam, 10)
    if (Number.isNaN(index) || index < 0) {
      throw new BadRequestError('Invalid index format')
    }

    const contract = await getContractInstance()
    const { institutionAddress, normalizedDomain } =
      await resolveInstitutionAddressFromSession(session, contract)
    const puc = getSessionPuc(session)

    const reservationKey = await contract.getInstitutionalUserReservationByIndex(
      institutionAddress,
      puc,
      index,
      { from: institutionAddress },
    )

    const reservationKeyStr = reservationKey?.toString() || '0x0000000000000000000000000000000000000000000000000000000000000000'

    if (reservationKeyStr !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
      try {
        const reservation = await contract.getReservation(reservationKeyStr)
        devLog.log('🧾 getUserReservationByIndex debug:', {
          index,
          key: reservationKeyStr,
          labId: reservation?.labId?.toString?.(),
          status: reservation?.status?.toString?.(),
          start: reservation?.start?.toString?.(),
          end: reservation?.end?.toString?.(),
        })
      } catch (debugError) {
        devLog.warn('⚠️ getUserReservationByIndex debug failed:', debugError?.message || debugError)
      }
    }

    console.log(
      `🔍 Getting reservation at index ${index} for PUC: ${puc.slice(0, 8)}... at institution ${institutionAddress.slice(0, 6)}...${institutionAddress.slice(-4)} (${normalizedDomain})`,
    )

    console.log(
      `✅ Reservation key: ${reservationKeyStr.slice(0, 10)}...`,
    )

    return Response.json(
      {
        reservationKey: reservationKeyStr,
        index,
        institutionAddress,
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
          { reservationKey: '0x0000000000000000000000000000000000000000000000000000000000mock01', index: 0, institutionAddress: '0x3D3D82982FC4B73cFc5913d2297762FdCeeC0965', institutionDomain: 'mock.edu' },
          { status: 200 }
        )
      }
      return Response.json(
        { reservationKey: null, index: null, institutionAddress: null, institutionDomain: null },
        { status: 200 }
      )
    }

    console.error('❌ [API] Error getting institutional user reservation by index:', error)
    return handleGuardError(error)
  }
}
