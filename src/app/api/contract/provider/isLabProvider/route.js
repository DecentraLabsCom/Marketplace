/**
 * API endpoint for checking if an address is a registered lab provider
 */
import devLog from '@/utils/dev/logger'
import { getContractInstance } from '../../utils/contractInstance'
import { retryBlockchainRead } from '@/app/api/contract/utils/retry'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get('wallet');
    
    if (!wallet) {
      return Response.json({ error: 'Missing wallet parameter' }, { status: 400 });
    }
    
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet.trim())) {
      return Response.json({ error: 'Invalid wallet address format' }, { status: 400 });
    }

    const contract = await getContractInstance();
    
    const isLabProvider = await retryBlockchainRead(async () => {
      return await Promise.race([
        contract.isLabProvider(wallet),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('timeout')), 10000)
        )
      ]);
    });

    return Response.json({
      success: true,
      data: {
        wallet: wallet.toLowerCase(),
        isLabProvider: Boolean(isLabProvider),
        checked: true
      }
    }, { 
      headers: { 'Cache-Control': 'no-cache' }
    });

  } catch (error) {
    devLog.error('Error in isLabProvider:', error);
    return Response.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}

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
