import { getContractInstance } from '../../utils/contractInstance'
import {
  getSessionPucHash,
  resolveInstitutionAddressFromSession,
} from '../../utils/institutionSession'
import { handleGuardError, requireAuth } from '@/utils/auth/guards'
import devLog from '@/utils/dev/logger'

export async function GET() {
  try {
    const session = await requireAuth()

    const contract = await getContractInstance()
    const { institutionAddress, normalizedDomain } =
      await resolveInstitutionAddressFromSession(session, contract)
    const pucHash = getSessionPucHash(session)

    const count = await contract.getInstitutionalUserReservationCount(
      institutionAddress,
      pucHash,
      { from: institutionAddress },
    )

    const reservationCount = Number(count)

    devLog.log('getUserReservationCount debug:', {
      institutionAddress,
      pucHash: `${pucHash.slice(0, 10)}...`,
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
    if (error?.code === 'BAD_REQUEST') {
      devLog.warn(
        '[API] getUserReservationCount skipped - session missing institutional context:',
        error.message,
      )
      return Response.json(
        {
          count: 0,
          institutionAddress: null,
          institutionDomain: null,
        },
        { status: 200 },
      )
    }

    console.error('Error getting institutional user reservation count:', error)
    return handleGuardError(error)
  }
}
