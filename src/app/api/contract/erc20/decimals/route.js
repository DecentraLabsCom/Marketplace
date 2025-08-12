/**
 * API endpoint for retrieving LAB token decimals
 * Returns the number of decimals used by the LAB token contract
 * Optimized for React Query client-side caching - no server-side cache
 */

import { getContractInstance } from '../../utils/contractInstance'

/**
 * Retrieves LAB token decimals from contract
 * @returns {Response} JSON response with decimals number
 */
export async function GET() {
  try {
    console.log('🔍 Fetching LAB token decimals');
    
    const labTokenContract = await getContractInstance('lab');
    
    // Single contract call for decimals
    const decimals = await labTokenContract.decimals();
    
    // Convert BigInt to number for compatibility
    const decimalsNumber = Number(decimals);
    
    console.log(`✅ LAB token decimals: ${decimalsNumber}`);
    
    return Response.json({ 
      decimals: decimalsNumber 
    }, { 
      status: 200
    });

  } catch (error) {
    console.error('❌ Error fetching LAB token decimals:', error);
    
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