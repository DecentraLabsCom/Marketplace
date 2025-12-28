/**
 * API endpoint for retrieving institutional user remaining allowance
 * Returns how much an institutional user can still spend in the current period
 * 
 * @security Protected - requires authenticated session
 */

import { getContractInstance } from '../../utils/contractInstance'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { isAddress } from 'viem'

/**
 * Retrieves institutional user remaining allowance
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.institutionAddress - Institution wallet address (required)
 * @param {string} request.searchParams.puc - schacPersonalUniqueCode (required)
 * @returns {Response} JSON response with remaining allowance
 */
export async function GET(request) {
  try {
    await requireAuth();
  } catch (error) {
    return handleGuardError(error);
  }

  const url = new URL(request.url);
  const institutionAddress = url.searchParams.get('institutionAddress');
  const puc = url.searchParams.get('puc');
  
  if (!institutionAddress) {
    return Response.json({ 
      error: 'Missing institutionAddress parameter' 
    }, { status: 400 });
  }

  if (!puc) {
    return Response.json({ 
      error: 'Missing puc parameter' 
    }, { status: 400 });
  }

  if (!isAddress(institutionAddress)) {
    return Response.json({ 
      error: 'Invalid address format' 
    }, { status: 400 });
  }

  try {
    console.log(`🔍 Fetching remaining allowance for PUC: ${puc}`);
    
    const contract = await getContractInstance();
    
    const allowance = await contract.getInstitutionalUserRemainingAllowance(institutionAddress, puc);
    
    console.log(`✅ Successfully fetched remaining allowance`);
    
    return Response.json({ 
      remainingAllowance: allowance?.toString() || '0',
      institutionAddress,
      puc
    }, { status: 200 });

  } catch (error) {
    console.error('❌ Error fetching remaining allowance:', error);
    
    return Response.json({ 
      error: 'Failed to fetch remaining allowance',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined 
    }, { status: 500 });
  }
}
