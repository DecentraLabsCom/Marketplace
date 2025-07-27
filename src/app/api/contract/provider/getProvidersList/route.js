/**
 * API endpoint for retrieving lab providers list from blockchain
 * Returns the list of registered lab providers
 * Optimized for React Query client-side caching - no server-side cache
 */
import devLog from '@/utils/dev/logger'
import { getContractInstance } from '../../utils/contractInstance'
import { retryBlockchainRead } from '@/app/api/contract/utils/retry'

/**
 * Retrieves lab providers list from contract
 * @returns {Response} JSON response with providers array
 */
export async function GET() {
  try {
    devLog.log('🔍 Fetching lab providers list');
    
    const contract = await getContractInstance();
    
    // Single contract call for providers
    const providerList = await retryBlockchainRead(() => contract.getLabProviders());
    
    devLog.log(`✅ Successfully fetched ${providerList.length} providers`);
    
    return Response.json(providerList, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache',
      }
    });

  } catch (error) {
    devLog.error('❌ Error fetching providers list:', error);
    
    return Response.json({ 
      error: 'Failed to fetch providers list',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}
