/**
 * API endpoint for retrieving institutional treasury balance
 * Returns the current balance of an institution's treasury
 * 
 * @security Protected - requires authenticated session
 */

import { getContractInstance } from '../../utils/contractInstance'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { isAddress } from 'viem'

/**
 * Retrieves institutional treasury balance
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.institutionAddress - Institution wallet address (required)
 * @returns {Response} JSON response with treasury balance
 */
export async function GET(request) {
  try {
    await requireAuth();
  } catch (error) {
    return handleGuardError(error);
  }

  const url = new URL(request.url);
  const institutionAddress = url.searchParams.get('institutionAddress');
  
  if (!institutionAddress) {
    return Response.json({ 
      error: 'Missing institutionAddress parameter' 
    }, { status: 400 });
  }

  if (!isAddress(institutionAddress)) {
    return Response.json({ 
      error: 'Invalid institutionAddress format' 
    }, { status: 400 });
  }

  try {
    console.log(`🔍 Fetching treasury balance for institution: ${institutionAddress.slice(0, 6)}...${institutionAddress.slice(-4)}`);
    
    const contract = await getContractInstance();
    
    const balance = await contract.getInstitutionalTreasuryBalance(institutionAddress);
    
    console.log(`✅ Successfully fetched treasury balance`);
    
    return Response.json({ 
      balance: balance?.toString() || '0',
      institutionAddress
    }, { status: 200 });

  } catch (error) {
    console.error('❌ Error fetching treasury balance:', error);
    
    return Response.json({ 
      error: 'Failed to fetch treasury balance',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      institutionAddress 
    }, { status: 500 });
  }
}
