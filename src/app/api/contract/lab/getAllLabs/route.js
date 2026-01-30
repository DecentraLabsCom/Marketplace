/**
 * API endpoint for retrieving basic lab list from blockchain
 * Returns only the raw lab IDs and basic contract data
 * Optimized for React Query client-side caching - no server-side cache
 */

import { getContractInstance } from '../../utils/contractInstance'
import { createSerializedJsonResponse } from '@/utils/blockchain/bigIntSerializer'

/**
 * Retrieves basic lab list from contract
 * @returns {Response} JSON response with array of basic lab data
 */
export async function GET() {
  try {
    console.log('🔍 Fetching basic lab list from contract');
    
    const contract = await getContractInstance();
    
    // New contract API: paginated labs (ids, total) or (total, ids)
    let ids;
    try {
      const result = await contract.getLabsPaginated(0, 100);
      if (Array.isArray(result?.[0])) {
        ids = result[0];
      } else if (Array.isArray(result?.[1])) {
        ids = result[1];
      } else if (Array.isArray(result?.ids)) {
        ids = result.ids;
      } else {
        ids = result;
      }
    } catch (error) {
      if (error.reason === 'FunctionNotFound(bytes4)' || error.message?.includes('FunctionNotFound') || error.code === 'CALL_EXCEPTION') {
        console.warn('⚠️ getLabsPaginated not available on this contract version, returning empty list');
        return createSerializedJsonResponse([], { status: 200 });
      }
      throw error;
    }
    
    // Convert all BigInt lab IDs to numbers for JSON serialization
    const convertedLabList = ids.map(labId => Number(labId));
    
    console.log(`✅ Successfully fetched ${convertedLabList.length} labs from contract`);
    
    return createSerializedJsonResponse(convertedLabList, { 
      status: 200
    });

  } catch (error) {
    console.error('❌ Error fetching lab list:', error);
    
    const shouldFallback =
      process.env.NODE_ENV === 'production' || process.env.CI === 'true';
    if (shouldFallback) {
      console.warn('ƒsÿ‹÷? Returning empty lab list due to provider error');
      return createSerializedJsonResponse([], {
        status: 200,
        headers: { 'x-labs-unavailable': '1' },
      });
    }

    return Response.json({
      error: 'Failed to fetch lab list',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}
