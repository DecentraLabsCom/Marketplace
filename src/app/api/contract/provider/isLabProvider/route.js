/**
 * API endpoint for checking if an address is a registered lab provider
 */

import { getContractInstance } from '../../utils/contractInstance'
/**
 * Checks if the specified wallet address is a registered lab provider
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.wallet - Wallet address to check (required)
 * @returns {Response} JSON response with provider status or error
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get('wallet');
  
    if (!wallet) {
      return Response.json({ error: 'Missing wallet parameter' }, {status: 400 });
    }
    
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet.trim())) {
      return Response.json({ error: 'Invalid wallet address format' }, {status: 400 });
    }

    const contract = await getContractInstance();

    const isLabProvider = await contract.isLabProvider(wallet);

    const result = {
      wallet: wallet.toLowerCase(),
      isLabProvider: Boolean(isLabProvider),
      checked: true
    };

    return Response.json(result, { 
      
    });

  } catch (error) {
    console.error('Error in isLabProvider:', error);
    return Response.json({ 
      error: 'Internal server error' 
    }, {status: 500 });
  }
}