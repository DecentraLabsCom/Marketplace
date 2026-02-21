/**
 * API endpoint for retrieving the required stake amount for a provider
 * Returns the minimum $LAB tokens a provider needs staked to operate
 */

import { getContractInstance } from '../../utils/contractInstance'
import { createSerializedJsonResponse } from '@/utils/blockchain/bigIntSerializer'
import devLog from '@/utils/dev/logger'

/**
 * Retrieves required stake for a provider based on their lab count
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.provider - Provider wallet address (required)
 * @returns {Response} JSON response with required stake amount
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
    devLog.log(`Fetching required stake for provider: ${provider}`)

    const contract = await getContractInstance()
    const requiredStake = await contract.getRequiredStake(provider)

    const transformedData = {
      requiredStake: requiredStake?.toString() || '0',
      provider: provider.toLowerCase()
    }

    devLog.log(`Successfully fetched required stake for provider: ${provider}`)

    return createSerializedJsonResponse(transformedData, { status: 200 })
  } catch (error) {
    devLog.error(`Error fetching required stake for ${provider}:`, error)

    return Response.json({
      error: `Failed to fetch required stake for ${provider}`,
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    }, { status: 500 })
  }
}
