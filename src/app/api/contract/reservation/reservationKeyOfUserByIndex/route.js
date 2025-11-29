/**
 * ATOMIC API endpoint for getting reservation key by user index
 * 1:1 relationship with contract.reservationKeyOfUserByIndex() call
 * 
 * @security Protected - requires authenticated session
 */

import { getContractInstance } from '../../utils/contractInstance'
import { isAddress } from 'viem'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'

/**
 * Get reservation key for a user at specific index
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.userAddress - User's wallet address (required)
 * @param {string} request.searchParams.index - Index of the reservation (required)
 * @returns {Response} JSON response with reservation key
 */
export async function GET(request) {
  try {
    // Authentication check - user reservation data requires login
    await requireAuth();
  } catch (error) {
    return handleGuardError(error);
  }

  const url = new URL(request.url);
  const userAddress = url.searchParams.get('userAddress');
  const index = url.searchParams.get('index');
  
  if (!userAddress) {
    return Response.json({ 
      error: 'Missing userAddress parameter' 
    }, {status: 400 });
  }

  if (index === null || index === undefined) {
    return Response.json({ 
      error: 'Missing index parameter' 
    }, {status: 400 });
  }

  if (!isAddress(userAddress)) {
    return Response.json({ 
      error: 'Invalid wallet address format' 
    }, {status: 400 });
  }

  const indexNum = parseInt(index);
  if (isNaN(indexNum) || indexNum < 0) {
    return Response.json({ 
      error: 'Invalid index parameter' 
    }, {status: 400 });
  }

  try {
    console.log(`🔍 Getting reservation key for user: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)} at index ${index}`);
    
    const contract = await getContractInstance();
    
    // ATOMIC: Single contract call to reservationKeyOfUserByIndex
    const reservationKey = await contract.reservationKeyOfUserByIndex(userAddress, indexNum);

    console.log(`🔑 Retrieved reservation key: ${reservationKey.toString().slice(0, 10)}...${reservationKey.toString().slice(-8)}`);
    
    return Response.json({ 
      reservationKey: reservationKey.toString(),
      userAddress,
      index: indexNum
    }, {status: 200});

  } catch (error) {
    console.error('❌ Error getting reservation key:', error);
        
    // Handle specific contract errors gracefully
    const isIndexOutOfRange = error.message && (
      error.message.includes('out of bounds') ||
      error.message.includes('index out of range') ||
      error.message.includes('array access out of bounds') ||
      error.code === 'CALL_EXCEPTION' ||
      error.reason?.includes('out of bounds')
    );
    
    if (isIndexOutOfRange) {
      console.log(`🔍 Index ${indexNum} appears to be out of range for user`);
      return Response.json({ 
        error: 'Index out of range',
        details: `Requested index ${indexNum} is not available for this user`,
        userAddress,
        index: indexNum,
        suggestion: 'Try with a lower index or check the total reservation count first'
      }, {status: 400 });
    }
    
    // For other contract errors, return 500 with detailed info
    return Response.json({ 
      error: 'Failed to get reservation key',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Contract call failed',
      errorCode: error.code,
      errorReason: error.reason,
      userAddress,
      index: indexNum
    }, {status: 500 });
  }
}
