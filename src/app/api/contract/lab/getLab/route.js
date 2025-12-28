/**
 * API endpoint for retrieving specific lab data from blockchain
 * Returns detailed lab information for a single lab ID
 * Optimized for React Query client-side caching - no server-side cache
 */

import { getContractInstance } from '../../utils/contractInstance'
import { createSerializedJsonResponse } from '@/utils/blockchain/bigIntSerializer'

/**
 * Retrieves specific lab data from contract
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.labId - Lab ID to fetch (required)
 * @returns {Response} JSON response with lab data
 */
export async function GET(request) {
  const url = new URL(request.url);
  const labId = url.searchParams.get('labId');
  
  if (!labId) {
    return Response.json({ 
      error: 'Missing labId parameter' 
    }, {status: 400 });
  }

  // Validate labId is a valid number
  const numericLabId = Number(labId);
  if (isNaN(numericLabId) || numericLabId < 0) {
    return Response.json({ 
      error: 'Invalid labId format - must be a positive number',
      providedLabId: labId 
    }, {status: 400 });
  }

  try {
    console.log(`🔍 Fetching lab data for ID: ${labId}`);
    
    const contract = await getContractInstance();
    
    // Single contract call for specific lab
    const labData = await contract.getLab(numericLabId);
    
    // Transform the raw contract response to expected structure
    // Contract returns: { "0": labId, "1": [uri, price, accessURI, accessKey, createdAt] }
    // Transform to: { labId, base: { uri, price, accessURI, accessKey, createdAt } }
    // Ensure ALL BigInt values are converted to strings
    const transformedData = {
      labId: Number(labData[0] || numericLabId), // Convert potential BigInt labId
      base: {
        uri: String(labData[1]?.[0] || ''),
        price: labData[1]?.[1] ? labData[1][1].toString() : '0',
        accessURI: String(labData[1]?.[2] || ''),
        accessKey: String(labData[1]?.[3] || ''),
        createdAt: labData[1]?.[4] ? Number(labData[1][4]) : 0
      }
    };
    
    console.log(`✅ Successfully fetched lab ${labId} data`);
    
    return createSerializedJsonResponse(transformedData, { 
      status: 200
    });

  } catch (error) {
    console.error(`❌ Error fetching lab ${labId} data:`, error);
    
    return Response.json({ 
      error: `Failed to fetch lab ${labId} data`,
      labId: numericLabId,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, {status: 500 });
  }
}
