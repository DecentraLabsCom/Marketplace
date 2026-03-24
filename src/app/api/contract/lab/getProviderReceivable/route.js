/**
 * API endpoint for retrieving provider receivable information for a lab
 * Returns the receivable already accrued or immediately settleable for provider payout.
 */

import { getContractInstance } from '../../utils/contractInstance'
import { createSerializedJsonResponse } from '@/utils/blockchain/bigIntSerializer'
import devLog from '@/utils/dev/logger'

export async function GET(request) {
  const url = new URL(request.url)
  const labId = url.searchParams.get('labId')

  if (!labId) {
    return Response.json({
      error: 'Missing labId parameter'
    }, { status: 400 })
  }

  const numericLabId = Number(labId)
  if (isNaN(numericLabId) || numericLabId < 0) {
    return Response.json({
      error: 'Invalid labId format - must be a positive number',
      providedLabId: labId
    }, { status: 400 })
  }

  try {
    devLog.log(`Fetching provider receivable for lab ID: ${labId}`)

    const contract = await getContractInstance()
    const receivable = await contract.getLabProviderReceivable(numericLabId)

    const rawCount = Number(receivable?.eligibleReservationCount ?? receivable?.[3] ?? 0)
    const transformedData = {
      providerReceivable: (receivable?.providerReceivable ?? receivable?.[0])?.toString() || '0',
      deferredInstitutionalReceivable: (receivable?.deferredInstitutionalReceivable ?? receivable?.[1])?.toString() || '0',
      totalReceivable: (receivable?.totalReceivable ?? receivable?.[2])?.toString() || '0',
      eligibleReservationCount: Number.isFinite(rawCount) ? rawCount : 0,
    }

    devLog.log(`Successfully fetched provider receivable for lab ID: ${labId}`)

    return createSerializedJsonResponse(transformedData, { status: 200 })
  } catch (error) {
    devLog.error(`Error fetching provider receivable for lab ${labId}:`, error)

    return Response.json({
      error: `Failed to fetch provider receivable for lab ${labId}`,
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    }, { status: 500 })
  }
}
