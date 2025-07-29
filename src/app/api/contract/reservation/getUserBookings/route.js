/**
 * ATOMIC API endpoint for getting all user reservation keys
 * Orchestrates atomic calls: reservationsOf + reservationKeyOfUserByIndex for each
 * This is a composed endpoint that uses multiple atomic contract calls
 */

import { getContractInstance } from '../../utils/contractInstance'
import { retryBlockchainRead } from '@/app/api/contract/utils/retry'
import { isAddress } from 'viem'

/**
 * Get all reservation keys for a user (composed of atomic contract calls)
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.userAddress - User's wallet address (required)
 * @returns {Response} JSON response with array of reservation keys
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
    console.log(`🔍 Fetching reservation keys for user: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`);
    
    const contract = await getContractInstance();
    
    // Step 1: Get total number of reservations (atomic call)
    const reservationsCount = await retryBlockchainRead(() => contract.reservationsOf(userAddress));
    const totalReservations = Number(reservationsCount);
    
    console.log(`📊 User has ${totalReservations} total reservations`);
    
    if (totalReservations === 0) {
      return Response.json({ 
        reservationKeys: [],
        count: 0,
        userAddress 
      }, { 
        status: 200,
        headers: { 'Cache-Control': 'no-cache' }
      });
    }
    
    // Step 2: Get all reservation keys (atomic calls in parallel)
    const reservationKeyPromises = Array.from({ length: totalReservations }, (_, index) =>
      retryBlockchainRead(() => contract.reservationKeyOfUserByIndex(userAddress, index))
    );
    
    const reservationKeys = await Promise.all(reservationKeyPromises);
    console.log(`🔑 Retrieved ${reservationKeys.length} reservation keys`);
    
    return Response.json({ 
      reservationKeys: reservationKeys.map(key => key.toString()),
      count: reservationKeys.length,
      userAddress 
    }, { 
      status: 200,
      headers: { 'Cache-Control': 'no-cache' }
    });

  } catch (error) {
    console.error('❌ Error fetching user reservation keys:', error);
    
    return Response.json({ 
      error: 'Failed to fetch user reservation keys',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      userAddress 
    }, { status: 500 });
  }
}
