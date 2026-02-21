/**
 * API endpoint for retrieving pending payout information for a lab
 * Returns breakdown of pending payouts: wallet, institutional, and total
 */

import { getContractInstance } from '../../utils/contractInstance'
import { createSerializedJsonResponse } from '@/utils/blockchain/bigIntSerializer'
import devLog from '@/utils/dev/logger'

/**
 * Retrieves pending payout data for a specific lab
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.labId - Lab ID to check (required)
 * @returns {Response} JSON response with pending payout breakdown
 */
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
    devLog.log(`Fetching pending payout for lab ID: ${labId}`)

    const contract = await getContractInstance()
    const payout = await contract.getPendingLabPayout(numericLabId)

    const rawCount = Number(payout?.institutionalCollectorCount ?? payout?.[3] ?? 0)
    const transformedData = {
      walletPayout: (payout?.walletPayout ?? payout?.[0])?.toString() || '0',
      institutionalPayout: (payout?.institutionalPayout ?? payout?.[1])?.toString() || '0',
      totalPayout: (payout?.totalPayout ?? payout?.[2])?.toString() || '0',
      institutionalCollectorCount: Number.isFinite(rawCount) ? rawCount : 0
    }

    devLog.log(`Successfully fetched pending payout for lab ID: ${labId}`)

    return createSerializedJsonResponse(transformedData, { status: 200 })
  } catch (error) {
    devLog.error(`Error fetching pending payout for lab ${labId}:`, error)

    return Response.json({
      error: `Failed to fetch pending payout for lab ${labId}`,
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    }, { status: 500 })
  }
}
