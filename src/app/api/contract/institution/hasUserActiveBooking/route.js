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
  resolveInstitutionAddressFromSession,
  getSessionPuc,
} from '../../utils/institutionSession'
import { BadRequestError, handleGuardError, requireAuth } from '@/utils/auth/guards'

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
      { from: institutionAddress },
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
    if (
      (error instanceof BadRequestError || error?.code === 'BAD_REQUEST') &&
      typeof error?.message === 'string' &&
      (error.message.includes('affiliation domain') || error.message.includes('Institution not registered'))
    ) {
      if (process.env.NEXT_PUBLIC_ENABLE_MOCK_SSO === 'true') {
        return Response.json(
          { hasActiveBooking: true, institutionAddress: '0x3D3D82982FC4B73cFc5913d2297762FdCeeC0965', puc: 'mock-puc', institutionDomain: 'mock.edu' },
          { status: 200 }
        )
      }
      return Response.json(
        { hasActiveBooking: false, institutionAddress: null, puc: null, institutionDomain: null },
        { status: 200 }
      )
    }

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
