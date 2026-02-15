/**
 * API endpoint for retrieving provider staking information from blockchain
 * Returns stake details: staked amount, slashed amount, lock status, and unstake eligibility
 */

import { getContractInstance } from '../../utils/contractInstance'
import { createSerializedJsonResponse } from '@/utils/blockchain/bigIntSerializer'
import devLog from '@/utils/dev/logger' 

/**
 * Retrieves staking information for a provider address
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.provider - Provider wallet address (required)
 * @returns {Response} JSON response with staking data
 */
export async function GET(request) {
  const url = new URL(request.url)
  const provider = url.searchParams.get('provider')

  if (!provider) {
    return Response.json({
      error: 'Missing provider parameter'
    }, { status: 400 })
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(provider.trim())) {
    return Response.json({
      error: 'Invalid provider address format'
    }, { status: 400 })
  }

  try {
    devLog.log(`Fetching stake info for provider: ${provider}`)

    const contract = await getContractInstance()
    const stakeInfo = await contract.getStakeInfo(provider)

    const transformedData = {
      stakedAmount: (stakeInfo?.stakedAmount ?? stakeInfo?.[0])?.toString() || '0',
      slashedAmount: (stakeInfo?.slashedAmount ?? stakeInfo?.[1])?.toString() || '0',
      lastReservationTimestamp: Number(stakeInfo?.lastReservationTimestamp ?? stakeInfo?.[2] ?? 0),
      unlockTimestamp: Number(stakeInfo?.unlockTimestamp ?? stakeInfo?.[3] ?? 0),
      canUnstake: Boolean(stakeInfo?.canUnstake ?? stakeInfo?.[4] ?? false)
    }

    devLog.log(`Successfully fetched stake info for provider: ${provider}`)

    return createSerializedJsonResponse(transformedData, { status: 200 })
  } catch (error) {
    devLog.error(`Error fetching stake info for ${provider}:`, error)

    return Response.json({
      error: `Failed to fetch stake info for ${provider}`,
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    }, { status: 500 })
  }
}
