/**
 * API endpoint for retrieving institutional service-credit balance
 * Returns the current credit balance of an institution
 * 
 * @security Protected - requires authenticated session
 */

import { getContractInstance } from '../../utils/contractInstance'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { isAddress } from 'viem'

/**
 * Retrieves institutional service-credit balance
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.institutionAddress - Institution wallet address (required)
 * @returns {Response} JSON response with credit balance
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
    console.log(`🔍 Fetching credit balance for institution: ${institutionAddress.slice(0, 6)}...${institutionAddress.slice(-4)}`);
    
    const contract = await getContractInstance();
    
    // On-chain function name is getInstitutionalTreasuryBalance — intentionally retained (contract ABI)
    const balance = await contract.getInstitutionalTreasuryBalance(institutionAddress);
    
    console.log(`✅ Successfully fetched credit balance`);
    
    return Response.json({ 
      balance: balance?.toString() || '0',
      institutionAddress
    }, { status: 200 });

  } catch (error) {
    console.error('❌ Error fetching credit balance:', error);
    
    return Response.json({ 
      error: 'Failed to fetch credit balance',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      institutionAddress 
    }, { status: 500 });
  }
}
