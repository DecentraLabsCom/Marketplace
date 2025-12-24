/**
 * API endpoint for retrieving lab reputation data from blockchain
 * Returns reputation stats for a single lab ID
 */

import { getContractInstance } from '../../utils/contractInstance'
import { createSerializedJsonResponse } from '@/utils/blockchain/bigIntSerializer'

const toNumber = (value) => {
  if (value === null || value === undefined) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Retrieves lab reputation data from contract
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.labId - Lab ID to fetch (required)
 * @returns {Response} JSON response with reputation data
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
    console.log(`Fetching lab reputation for ID: ${labId}`)
    
    const contract = await getContractInstance()
    const reputation = await contract.getLabReputation(numericLabId)

    const transformedData = {
      score: toNumber(reputation?.score ?? reputation?.[0]),
      totalEvents: toNumber(reputation?.totalEvents ?? reputation?.[1]),
      ownerCancellations: toNumber(reputation?.ownerCancellations ?? reputation?.[2]),
      institutionalCancellations: toNumber(reputation?.institutionalCancellations ?? reputation?.[3]),
      lastUpdated: toNumber(reputation?.lastUpdated ?? reputation?.[4])
    }

    console.log(`Successfully fetched lab reputation for ID: ${labId}`)

    return createSerializedJsonResponse(transformedData, { status: 200 })
  } catch (error) {
    console.error(`Error fetching lab reputation ${labId}:`, error)
    
    return Response.json({ 
      error: `Failed to fetch lab reputation ${labId}`,
      labId: numericLabId,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 })
  }
}
