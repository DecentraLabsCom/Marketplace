/**
 * API endpoint for getting provider count
 * Handles GET requests to fetch total number of providers
 * Atomic endpoint - only calls getProviderCount contract method
 */
import devLog from '@/utils/dev/logger'
import { getContractInstance } from '../../utils/contractInstance'
import { retryBlockchainRead } from '@/app/api/contract/utils/retry'

/**
 * Gets the total number of providers
 * @param {Request} request - HTTP request
 * @returns {Response} JSON response with provider count or error
 */
export async function GET(request) {
  try {
    devLog.log('🔍 Fetching provider count');
    
    const contract = await getContractInstance();
    const providerCount = await retryBlockchainRead(() => contract.getProviderCount());
    
    devLog.log(`✅ Provider count: ${providerCount}`);

    return Response.json({ 
      success: true,
      providerCount: Number(providerCount)
    }, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache', // Let React Query handle caching
      }
    });

  } catch (error) {
    devLog.error('❌ Error fetching provider count:', error);
    
    return Response.json({ 
      error: 'Failed to fetch provider count',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}
