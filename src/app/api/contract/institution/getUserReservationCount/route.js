/**
 * API endpoint for getting institutional user's total reservation count
 * Returns the count of all reservations for an SSO user
 * 
 * Calls: getInstitutionalUserReservationCount(institutionalProvider, puc)
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
 * Gets the total count of reservations for an institutional user
 * Derives institution wallet and puc from authenticated session
 * @param {Request} request - HTTP request
 * @returns {Response} JSON response with reservation count
 */
export async function GET(request) {
  try {
    const session = await requireAuth()

    const contract = await getContractInstance()
    const { institutionAddress, normalizedDomain } =
      await resolveInstitutionAddressFromSession(session, contract)
    const puc = getSessionPuc(session)

    const count = await contract.getInstitutionalUserReservationCount(
      institutionAddress,
      puc,
      { from: institutionAddress },
    )

    const reservationCount = Number(count)

    console.log(
      `📊 Getting reservation count for PUC: ${puc.slice(0, 8)}... at institution ${institutionAddress.slice(0, 6)}...${institutionAddress.slice(-4)} (${normalizedDomain})`,
    )

    console.log(
      `✅ Total reservations: ${reservationCount}`,
    )

    devLog.log('🧾 getUserReservationCount debug:', {
      institutionAddress,
      puc: puc ? `${puc.slice(0, 8)}...` : null,
      count: reservationCount,
    })

    return Response.json(
      {
        count: reservationCount,
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
      devLog.warn(`[API] getUserReservationCount: ${error.message}`);
      
      if (process.env.NEXT_PUBLIC_ENABLE_MOCK_SSO === 'true') {
        return Response.json(
          { count: 1, institutionAddress: '0x3D3D82982FC4B73cFc5913d2297762FdCeeC0965', institutionDomain: 'mock.edu' },
          { status: 200 }
        )
      }

      return Response.json(
        { count: 0, institutionAddress: null, institutionDomain: null },
        { status: 200 }
      )
    }

    console.error('Error getting institutional user reservation count:', error)
    return handleGuardError(error)
  }
}

