/**
 * API endpoint for retrieving basic lab list from blockchain
 * Returns only the raw lab IDs and basic contract data
 * Optimized for React Query client-side caching - no server-side cache
 */

import { getContractInstance } from '../../utils/contractInstance'
import { createSerializedJsonResponse } from '@/app/api/contract/utils/bigIntSerializer'

/**
 * Retrieves basic lab list from contract
 * @returns {Response} JSON response with array of basic lab data
 */
export async function GET() {
  try {
    console.log('🔍 Fetching basic lab list from contract');
    
    const contract = await getContractInstance();
    
    // Single contract call for lab list
    const labList = await contract.getAllLabs();
    
    console.log(`✅ Successfully fetched ${labList.length} labs from contract`);
    
    return createSerializedJsonResponse(labList, { 
      status: 200
    });

  } catch (error) {
    console.error('❌ Error fetching lab list:', error);
    
    return Response.json({ 
      error: 'Failed to fetch lab list',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, {status: 500 });
  }
}
