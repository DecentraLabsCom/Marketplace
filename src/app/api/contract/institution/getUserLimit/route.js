/**
 * API endpoint for retrieving institutional user limit
 * Returns the spending limit configured for an institutional user
 * 
 * @security Protected - requires authenticated session
 */

import { getContractInstance } from '../../utils/contractInstance'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'
import { isAddress } from 'viem'

/**
 * Retrieves institutional user spending limit
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.institutionAddress - Institution wallet address (required)
 * @param {string} request.searchParams.userAddress - User wallet address (required)
 * @returns {Response} JSON response with user limit
 */
export async function GET(request) {
  try {
    await requireAuth();
  } catch (error) {
    return handleGuardError(error);
  }

  const url = new URL(request.url);
  const institutionAddress = url.searchParams.get('institutionAddress');
  const userAddress = url.searchParams.get('userAddress');
  
  if (!institutionAddress) {
    return Response.json({ 
      error: 'Missing institutionAddress parameter' 
    }, { status: 400 });
  }

  if (!userAddress) {
    return Response.json({ 
      error: 'Missing userAddress parameter' 
    }, { status: 400 });
  }

  if (!isAddress(institutionAddress) || !isAddress(userAddress)) {
    return Response.json({ 
      error: 'Invalid address format' 
    }, { status: 400 });
  }

  try {
    console.log(`🔍 Fetching user limit for: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`);
    
    const contract = await getContractInstance();
    
    const limit = await contract.getInstitutionalUserLimit(institutionAddress, userAddress);
    
    console.log(`✅ Successfully fetched user limit`);
    
    return Response.json({ 
      limit: limit?.toString() || '0',
      institutionAddress,
      userAddress
    }, { status: 200 });

  } catch (error) {
    console.error('❌ Error fetching user limit:', error);
    
    return Response.json({ 
      error: 'Failed to fetch user limit',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined 
    }, { status: 500 });
  }
}
