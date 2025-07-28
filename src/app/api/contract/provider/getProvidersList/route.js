/**
 * API endpoint for retrieving lab providers list from blockchain
 * Returns the list of registered lab providers
 * Optimized for React Query client-side caching - no server-side cache
 */

import { getContractInstance } from '../../utils/contractInstance'
import { retryBlockchainRead } from '@/app/api/contract/utils/retry'
import { createSerializedJsonResponse } from '@/utils/blockchain/bigIntSerializer'

/**
 * Retrieves lab providers list from contract
 * @returns {Response} JSON response with providers array
 */
export async function GET() {
  try {
    console.log('🔍 Fetching lab providers list');
    
    const contract = await getContractInstance();
    
    // Single contract call for providers
    const providerList = await retryBlockchainRead(() => contract.getLabProviders());
    
    console.log(`✅ Successfully fetched ${providerList.length} providers`);
    
    return createSerializedJsonResponse(providerList, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache',
      }
    });

  } catch (error) {
    console.error('❌ Error fetching providers list:', error);
    
    return Response.json({ 
      error: 'Failed to fetch providers list',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}
