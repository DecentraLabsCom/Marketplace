/**
 * API endpoint for retrieving owned lab ID by owner index
 * Returns a specific lab ID owned by a wallet at a given index (atomic operation)
 * Optimized for React Query client-side caching - no server-side cache
 */

import { isAddress } from 'viem'
import { getContractInstance } from '../../utils/contractInstance'
import { retryBlockchainRead } from '@/app/api/contract/utils/retry'

/**
 * Retrieves lab ID owned by a wallet at a specific index
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.wallet - Wallet address (required)
 * @param {string} request.searchParams.index - Index of the owned lab (required, 0-based)
 * @returns {Response} JSON response with lab ID or error
 */
export async function GET(request) {
  const url = new URL(request.url);
  const wallet = url.searchParams.get('wallet');
  const index = url.searchParams.get('index');
  
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

  if (index === null || index === undefined) {
    return Response.json({ 
      error: 'Missing index parameter' 
    }, { status: 400 });
  }

  // Validate index is a valid number
  const numericIndex = Number(index);
  if (isNaN(numericIndex) || numericIndex < 0) {
    return Response.json({ 
      error: 'Invalid index format - must be a non-negative number',
      providedIndex: index 
    }, { status: 400 });
  }

  try {
    console.log(`🔍 Fetching owned lab at index ${index} for wallet: ${wallet.slice(0, 6)}...${wallet.slice(-4)}`);
    
    const contract = await getContractInstance();
    
    // Single contract call for tokenOfOwnerByIndex (ERC-721 enumerable)
    const labId = await retryBlockchainRead(() => contract.tokenOfOwnerByIndex(wallet, numericIndex));
    
    // Convert BigInt to string for compatibility
    const labIdStr = labId.toString();
    
    console.log(`✅ Lab at index ${index} is ID: ${labIdStr}`);
    
    return Response.json({
      labId: labIdStr,
      index: numericIndex,
      wallet
    }, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache',
      }
    });

  } catch (error) {
    console.error(`❌ Error fetching lab at index ${index} for wallet ${wallet}:`, error);
    
    return Response.json({ 
      error: `Failed to fetch lab at index ${index}`,
      wallet,
      index: numericIndex,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}
