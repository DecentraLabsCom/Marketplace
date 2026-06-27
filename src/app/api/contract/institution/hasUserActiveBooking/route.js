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
      return handleGuardError(error)
    }

    console.error('Error checking active booking:', error)

    return Response.json(
      {
        error: 'Failed to check active booking',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      },
      { status: 500 },
    )
  }
}
