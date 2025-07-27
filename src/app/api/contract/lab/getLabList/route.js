/**
 * API endpoint for retrieving basic lab list from blockchain
 * Returns only the raw lab IDs and basic contract data
 * Optimized for React Query client-side caching - no server-side cache
 */
import devLog from '@/utils/dev/logger'
import { getContractInstance } from '../../utils/contractInstance'
import { retryBlockchainRead } from '@/app/api/contract/utils/retry'

/**
 * Retrieves basic lab list from contract
 * @returns {Response} JSON response with array of basic lab data
 */
export async function GET() {
  try {
    devLog.log('🔍 Fetching basic lab list from contract');
    
    const contract = await getContractInstance();
    
    // Single contract call for lab list
    const labList = await retryBlockchainRead(() => contract.getAllLabs());
    
    devLog.log(`✅ Successfully fetched ${labList.length} labs from contract`);
    
    return Response.json(labList, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache',
      }
    });

  } catch (error) {
    devLog.error('❌ Error fetching lab list:', error);
    
    return Response.json({ 
      error: 'Failed to fetch lab list',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}
