/**
 * API endpoint for retrieving owned lab count for a wallet address
 * Returns the number of labs owned by a specific wallet (atomic operation)
 * Optimized for React Query client-side caching - no server-side cache
 */

import { isAddress } from 'viem'
import { getContractInstance } from '../../utils/contractInstance'
import { retryBlockchainRead } from '@/app/api/contract/utils/retry'

/**
 * Retrieves count of labs owned by a specific wallet address
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.wallet - Wallet address to check ownership for (required)
 * @returns {Response} JSON response with owned lab count or error
 */
export async function GET(request) {
  const url = new URL(request.url);
  const wallet = url.searchParams.get('wallet');
  
  if (!wallet) {
    return Response.json({ 
      error: 'Missing wallet parameter' 
    }, { status: 400 });
  }

  if (!isAddress(wallet)) {
    return Response.json({ 
      error: 'Invalid wallet address format' 
    }, { status: 400 });
  }

  try {
    console.log(`🔍 Fetching owned lab count for wallet: ${wallet.slice(0, 6)}...${wallet.slice(-4)}`);
    
    const contract = await getContractInstance();
    
    // Single contract call for balance (ERC-721 standard)
    const balance = await retryBlockchainRead(() => contract.balanceOf(wallet));
    
    // Convert BigInt to number for compatibility
    const count = Number(balance);
    
    console.log(`✅ Wallet owns ${count} labs`);
    
    return Response.json({
      count,
      wallet
    }, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache',
      }
    });

  } catch (error) {
    console.error(`❌ Error fetching owned lab count for wallet ${wallet}:`, error);
    
    return Response.json({ 
      error: `Failed to fetch owned lab count`,
      wallet,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}
