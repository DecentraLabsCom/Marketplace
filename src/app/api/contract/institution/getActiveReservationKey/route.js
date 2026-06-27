import { getContractInstance } from '../../utils/contractInstance'
import {
  getSessionPucHash,
  resolveInstitutionAddressFromSession,
} from '../../utils/institutionSession'
import {
  BadRequestError,
  handleGuardError,
  requireAuth,
} from '@/utils/auth/guards'

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000'

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
    const pucHash = getSessionPucHash(session)

    const reservationKey = await contract.getInstitutionalUserActiveReservationKey(
      institutionAddress,
      pucHash,
      labIdNum,
    )

    const reservationKeyStr = reservationKey?.toString() || ZERO_BYTES32
    const hasActiveReservation = reservationKeyStr !== ZERO_BYTES32

    return Response.json(
      {
        reservationKey: reservationKeyStr,
        hasActiveReservation,
        institutionAddress,
        pucHash,
        labId: labIdNum,
        institutionDomain: normalizedDomain,
      },
      { status: 200 },
    )
  } catch (error) {
    if (error instanceof BadRequestError) {
      return handleGuardError(error)
    }

    console.error('Error getting active reservation key:', error)

    return Response.json(
      {
        error: 'Failed to get active reservation key',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 },
    )
  }
}
