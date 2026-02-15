import { NextResponse } from 'next/server';
import { getContractInstance } from '../../utils/contractInstance';import devLog from '@/utils/dev/logger' /**
 * Get all lab providers
 * GET /api/contract/provider/getLabProviders
 * 
 * @returns {Object} Array of all lab providers
 */
export async function GET() {
  try {
    devLog.log('[API] getLabProviders: Fetching all lab providers');

    const contract = await getContractInstance();
    if (!contract) {
      return NextResponse.json({ 
        error: 'Failed to connect to blockchain',
        code: 'CONNECTION_ERROR'
      }, {status: 500 });
    }

    // Call getLabProviders function
    const providers = await contract.getLabProviders();

    devLog.log(`[API] getLabProviders: Successfully retrieved ${providers.length} providers`);

    return NextResponse.json({
      providers: providers.map(provider => ({
        account: provider.account,
        name: provider.base.name,
        email: provider.base.email,
        country: provider.base.country,
        authURI: provider.base.authURI || ''
      })),
      count: providers.length,
      timestamp: new Date().toISOString()
    }, {status: 200});

  } catch (error) {
    devLog.error('Error getting lab providers:', error);
    
    // Handle specific error types
    if (error.message?.includes('execution reverted')) {
      return NextResponse.json({ 
        error: 'Smart contract execution failed',
        code: 'CONTRACT_EXECUTION_ERROR',
        details: error.message
      }, {status: 400 });
    }

    return NextResponse.json(
      { 
        error: `Failed to get lab providers: ${error.message}`,
        code: 'INTERNAL_ERROR'
      }, {status: 500 }
    );
  }
}
