/**
 * API endpoint for retrieving service-credit decimals
 * Returns the number of decimals used by the credit ledger contract
 * Optimized for React Query client-side caching - no server-side cache
 */

import { getContractInstance } from '../../utils/contractInstance'

/**
 * Retrieves service-credit decimals from contract
 * @returns {Response} JSON response with decimals number
 */
export async function GET() {
  try {
    console.log('🔍 Fetching service-credit decimals');
    
    const labTokenContract = await getContractInstance('lab');
    
    // Single contract call for decimals
    const decimals = await labTokenContract.decimals();
    
    // Convert BigInt to number for compatibility
    const decimalsNumber = Number(decimals);
    
    console.log(`✅ Service-credit decimals: ${decimalsNumber}`);
    
    return Response.json({ 
      decimals: decimalsNumber 
    }, { 
      status: 200
    });

  } catch (error) {
    console.error('❌ Error fetching service-credit decimals:', error);
    
    // Fallback to default value
    const defaultDecimals = 6;
    console.warn(`Using default decimals: ${defaultDecimals}`);
    
    return Response.json({ 
      decimals: defaultDecimals,
      fallback: true
    }, { 
      status: 200
    });
  }
}