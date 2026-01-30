/**
 * API endpoint for retrieving basic lab list from blockchain
 * Returns only the raw lab IDs and basic contract data
 * Optimized for React Query client-side caching - no server-side cache
 */

import { getContractInstance } from '../../utils/contractInstance'
import { createSerializedJsonResponse } from '@/utils/blockchain/bigIntSerializer'
import devLog from '@/utils/dev/logger'

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
      devLog.log('🧾 getLabsPaginated raw shape:', {
        isArray: Array.isArray(result),
        keys: result && typeof result === 'object' ? Object.keys(result).slice(0, 6) : null,
        first: Array.isArray(result) ? result[0]?.toString?.() : result?.[0]?.toString?.(),
        secondIsArray: Array.isArray(result?.[1]) || (result?.[1] && typeof result[1].length === 'number'),
        idsLen: Array.isArray(result?.ids) ? result.ids.length : undefined,
        total: typeof result?.total === 'bigint' ? result.total.toString() : result?.total
      });
      const arrayLike = (value) => value && typeof value.length === 'number';
      const totalCandidate = typeof result?.[0] === 'bigint' ? result[0] : result?.total;
      let idsCandidate =
        Array.isArray(result?.[0]) || arrayLike(result?.[0]) ? result[0]
        : Array.isArray(result?.[1]) || arrayLike(result?.[1]) ? result[1]
        : Array.isArray(result?.ids) || arrayLike(result?.ids) ? result.ids
        : result;

      // If we accidentally picked the total as ids (e.g. [total] only), avoid poisoning IDs.
      if (
        arrayLike(idsCandidate) &&
        idsCandidate.length === 1 &&
        totalCandidate !== undefined &&
        Number(idsCandidate[0]) === Number(totalCandidate)
      ) {
        idsCandidate = Array.isArray(result?.[1]) || arrayLike(result?.[1]) ? result[1] : [];
      }

      ids = idsCandidate;
    } catch (error) {
      devLog.warn('⚠️ getLabsPaginated failed:', {
        message: error?.message,
        code: error?.code,
        reason: error?.reason,
      });
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
