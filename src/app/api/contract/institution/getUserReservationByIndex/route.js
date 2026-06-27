import { getContractInstance } from '../../utils/contractInstance'
import {
  getSessionPucHash,
  resolveInstitutionAddressFromSession,
} from '../../utils/institutionSession'
import { BadRequestError, handleGuardError, requireAuth } from '@/utils/auth/guards'
import devLog from '@/utils/dev/logger'

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000'

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
    const pucHash = getSessionPucHash(session)

    const reservationKey = await contract.getInstitutionalUserReservationByIndex(
      institutionAddress,
      pucHash,
      index,
      { from: institutionAddress },
    )

    const reservationKeyStr = reservationKey?.toString() || ZERO_BYTES32

    if (reservationKeyStr !== ZERO_BYTES32) {
      try {
        const reservation = await contract.getReservation(reservationKeyStr)
        devLog.log('getUserReservationByIndex debug:', {
          index,
          key: reservationKeyStr,
          labId: reservation?.labId?.toString?.(),
          status: reservation?.status?.toString?.(),
          start: reservation?.start?.toString?.(),
          end: reservation?.end?.toString?.(),
        })
      } catch (debugError) {
        devLog.warn('getUserReservationByIndex debug failed:', debugError?.message || debugError)
      }
    }

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
    console.error('[API] Error getting institutional user reservation by index:', error)
    return handleGuardError(error)
  }
}
