/**
 * ATOMIC API endpoint for getting reservation count for a user
 * 1:1 relationship with contract.reservationsOf() call
 */

import { getContractInstance } from '../../utils/contractInstance'
import { retryBlockchainRead } from '@/app/api/contract/utils/retry'
import { isAddress } from 'viem'

/**
 * Get total number of reservations for a user address
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.userAddress - User's wallet address (required)
 * @returns {Response} JSON response with reservation count
 */
export async function GET(request) {
  const url = new URL(request.url);
  const userAddress = url.searchParams.get('userAddress');
  
  if (!userAddress) {
    return Response.json({ 
      error: 'Missing userAddress parameter' 
    }, { status: 400 });
  }

  if (!isAddress(userAddress)) {
    return Response.json({ 
      error: 'Invalid wallet address format' 
    }, { status: 400 });
  }

  try {
    console.log(`🔍 Getting reservation count for user: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`);
    
    const contract = await getContractInstance();
    
    // ATOMIC: Single contract call to reservationsOf
    const reservationsCount = await retryBlockchainRead(() => contract.reservationsOf(userAddress));
    const totalReservations = Number(reservationsCount);
    
    console.log(`📊 User has ${totalReservations} total reservations`);
    
    return Response.json({ 
      count: totalReservations,
      userAddress 
    }, { 
      status: 200,
      headers: { 'Cache-Control': 'no-cache' }
    });

  } catch (error) {
    console.error('❌ Error getting reservation count:', error);
    
    return Response.json({ 
      error: 'Failed to get reservation count',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      userAddress 
    }, { status: 500 });
  }
}
