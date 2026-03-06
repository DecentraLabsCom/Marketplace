/**
 * API endpoint for retrieving basic lab list from blockchain
 * Returns only the raw lab IDs and basic contract data
 * Optimized for React Query client-side caching - no server-side cache
 */

import { getContractInstance } from '../../utils/contractInstance'
import { createSerializedJsonResponse } from '@/utils/blockchain/bigIntSerializer'
import devLog from '@/utils/dev/logger'

const EXISTENCE_CHECK_CONCURRENCY = 12;

const isMissingLabError = (error) => {
  const details = String(
    error?.reason ||
    error?.shortMessage ||
    error?.message ||
    ''
  ).toLowerCase();

  return (
    details.includes('lab does not exist') ||
    details.includes('erc721nonexistenttoken') ||
    details.includes('nonexistent token') ||
    details.includes('token does not exist')
  );
};

const mapWithConcurrency = async (items, concurrency, mapper) => {
  if (!Array.isArray(items) || items.length === 0) return [];

  const results = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  const workers = Array.from({ length: workerCount }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
};

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
    
    // Normalize and deduplicate lab IDs from contract response
    const convertedLabList = Array.from(
      new Set(
        ids
          .map((labId) => Number(labId))
          .filter((labId) => Number.isFinite(labId))
      )
    );

    // Defensive filtering: some contract versions can return IDs that were deleted on-chain.
    // Keep only IDs that still resolve as existing tokens.
    const existenceChecks = await mapWithConcurrency(
      convertedLabList,
      EXISTENCE_CHECK_CONCURRENCY,
      async (candidateLabId) => {
        try {
          await contract.ownerOf(candidateLabId);
          return { labId: candidateLabId, exists: true };
        } catch (error) {
          if (isMissingLabError(error)) {
            return { labId: candidateLabId, exists: false };
          }
          devLog.warn('⚠️ ownerOf existence check failed, keeping lab id to avoid false negatives', {
            labId: candidateLabId,
            message: error?.message,
            reason: error?.reason,
            shortMessage: error?.shortMessage,
          });
          return { labId: candidateLabId, exists: true };
        }
      }
    );

    const filteredLabList = existenceChecks
      .filter((check) => check?.exists)
      .map((check) => check.labId);

    const removedCount = convertedLabList.length - filteredLabList.length;
    if (removedCount > 0) {
      devLog.warn('🧹 Removed deleted lab IDs from getAllLabs response', {
        removedCount,
        before: convertedLabList.length,
        after: filteredLabList.length,
      });
    }
    
    console.log(`✅ Successfully fetched ${filteredLabList.length} labs from contract`);
    
    return createSerializedJsonResponse(filteredLabList, { 
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
