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
import { publicErrorResponse } from '@/utils/security/publicError'

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

    const hasActiveBooking = await contract.hasInstitutionalUserActiveBooking(
      institutionAddress,
      pucHash,
      labIdNum,
      { from: institutionAddress },
    )

    return Response.json(
      {
        hasActiveBooking: Boolean(hasActiveBooking),
        institutionAddress,
        labId: labIdNum,
        institutionDomain: normalizedDomain,
      },
      { status: 200 },
    )
  } catch (error) {
    if (error instanceof BadRequestError) {
      return handleGuardError(error, request)
    }

    return publicErrorResponse({
      status: 500,
      code: 'ACTIVE_BOOKING_LOOKUP_FAILED',
      message: 'The active booking could not be checked.',
      error,
      context: 'institution-active-booking',
    })
  }
}
