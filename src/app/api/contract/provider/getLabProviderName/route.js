/**
 * API endpoint for retrieving lab provider name by wallet address  
 */
import devLog from '@/utils/dev/logger'
import { getContractInstance } from '../../utils/contractInstance'
import { retryBlockchainRead } from '@/app/api/contract/utils/retry'

/**
 * Retrieves lab provider name by wallet address
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.wallet - Wallet address to lookup (required)
 * @returns {Response} JSON response with provider name or error
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get('wallet');
    
    if (!wallet) {
      return Response.json({ error: 'Missing wallet parameter' }, { status: 400 });
    }
    
    const contract = await getContractInstance();
    const providerList = await retryBlockchainRead(() => contract.getLabProviders());
    
    const provider = providerList.find(
      (p) => p.account && p.account.toLowerCase() === wallet.toLowerCase()
    );

    if (provider && provider.base && provider.base.name) {
      return Response.json({
        success: true,
        data: { wallet, name: provider.base.name, found: true }
      }, { 
        headers: { 'Cache-Control': 'no-cache' }
      });
    } else {
      return Response.json({
        success: true,
        data: { wallet, name: null, found: false }
      }, { 
        headers: { 'Cache-Control': 'no-cache' }
      });
    }

  } catch (error) {
    devLog.error('Error in getLabProviderName:', error);
    return Response.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

/**
 * Alternative POST endpoint for retrieving provider name
 * @param {Request} request - HTTP request with wallet in body
 * @param {Object} request.body - Request body
 * @param {string} request.body.wallet - Wallet address to lookup (required)
 * @returns {Response} JSON response with provider name or error
 */
export async function POST(request) {
  const body = await request.json();
  const { wallet } = body;
  
  if (!wallet) {
    return Response.json({ error: 'Missing wallet field' }, { status: 400 });
  }
  
  const url = new URL(request.url);
  url.searchParams.set('wallet', wallet);
  
  const getRequest = new Request(url.toString(), {
    method: 'GET',
    headers: request.headers
  });
  
  return GET(getRequest);
}
