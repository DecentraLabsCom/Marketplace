/**
 * API endpoint for retrieving lab owner from blockchain
 * Returns the wallet address that owns a specific lab
 * Optimized for React Query client-side caching - no server-side cache
 */

import { getContractInstance } from '../../utils/contractInstance'
import { retryBlockchainRead } from '@/app/api/contract/utils/retry'

/**
 * Retrieves lab owner from contract
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.labId - Lab ID to check ownership (required)
 * @returns {Response} JSON response with owner address
 */
export async function GET(request) {
  const url = new URL(request.url);
  const labId = url.searchParams.get('labId');
  
  if (!labId) {
    return Response.json({ 
      error: 'Missing labId parameter' 
    }, { status: 400 });
  }

  // Validate labId is a valid number
  const numericLabId = Number(labId);
  if (isNaN(numericLabId) || numericLabId < 0) {
    return Response.json({ 
      error: 'Invalid labId format - must be a positive number',
      providedLabId: labId 
    }, { status: 400 });
  }

  try {
    console.log(`🔍 Fetching owner for lab ID: ${labId}`);
    
    const contract = await getContractInstance();
    
    // Single contract call for owner
    const owner = await retryBlockchainRead(() => contract.ownerOf(numericLabId));
    
    console.log(`✅ Lab ${labId} owner: ${owner.slice(0, 6)}...${owner.slice(-4)}`);
    
    return Response.json({
      labId: numericLabId,
      owner: owner
    }, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache',
      }
    });

  } catch (error) {
    console.error(`❌ Error fetching owner for lab ${labId}:`, error);
    
    return Response.json({ 
      error: `Failed to fetch owner for lab ${labId}`,
      labId: numericLabId,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}
