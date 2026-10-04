import { getContractInstance } from '../../utils/contractInstance'
import {
  getSessionPucHash,
  resolveInstitutionAddressFromSession,
} from '../../utils/institutionSession'
import { BadRequestError, handleGuardError, requireAuth } from '@/utils/auth/guards'
import { publicErrorResponse } from '@/utils/security/publicError'

const readResult = (result, name, index) => (
  result?.[name]?.toString?.() || result?.[index]?.toString?.() || '0'
)

export async function GET(request) {
  try {
    const session = await requireAuth()
    const contract = await getContractInstance()
    const { institutionAddress, normalizedDomain } =
      await resolveInstitutionAddressFromSession(session, contract)
    const pucHash = getSessionPucHash(session)
    const result = await contract.getInstitutionalUserFinancialStats(institutionAddress, pucHash)

    return Response.json({
      currentPeriodSpent: readResult(result, 'currentPeriodSpent', 0),
      totalHistoricalSpent: readResult(result, 'totalHistoricalSpent', 1),
      spendingLimit: readResult(result, 'spendingLimit', 2),
      remainingAllowance: readResult(result, 'remainingAllowance', 3),
      periodStart: readResult(result, 'periodStart', 4),
      periodEnd: readResult(result, 'periodEnd', 5),
      periodDuration: readResult(result, 'periodDuration', 6),
      institutionAddress,
      institutionDomain: normalizedDomain,
    })
  } catch (error) {
    if (error instanceof BadRequestError) {
      return handleGuardError(error, request)
    }

    return publicErrorResponse({
      status: 500,
      code: 'INSTITUTIONAL_SPENDING_STATS_LOOKUP_FAILED',
      message: 'The institutional spending allowance could not be loaded.',
      error,
      context: 'institutional-spending-stats',
    })
  }
}
