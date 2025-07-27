/**
 * API endpoint for retrieving user booking reservations
 * Handles GET requests to fetch user-specific booking data
 */
import devLog from '@/utils/dev/logger'
import { getContractInstance } from '../../utils/contractInstance'
import { retryBlockchainRead } from '@/app/api/contract/utils/retry'
import { isAddress } from 'viem'

/**
 * Retrieves all bookings for a specific user address
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.userAddress - User's wallet address (required)
 * @returns {Response} JSON response with user's booking array or error
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
    devLog.log(`🔍 Fetching bookings for user: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`);
    
    const contract = await getContractInstance();
    const blockchainBookings = await retryBlockchainRead(() => contract.getUserBookings(userAddress));
    
    // Process and format bookings
    const processedBookings = blockchainBookings.map((booking, index) => {
      const [reservationKey, labId, start, end, status] = booking;
      
      return {
        id: index,
        reservationKey: reservationKey.toString(),
        labId: labId.toString(),
        start: start.toString(),
        end: end.toString(),
        status: status.toString(),
        startDate: new Date(Number(start) * 1000),
        endDate: new Date(Number(end) * 1000),
        duration: Number(end) - Number(start),
        isActive: Date.now() >= Number(start) * 1000 && Date.now() < Number(end) * 1000,
      };
    });

    devLog.log(`✅ Successfully fetched ${processedBookings.length} bookings`);
    
    return Response.json({ 
      bookings: processedBookings,
      count: processedBookings.length,
      userAddress 
    }, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache', // Let React Query handle caching
      }
    });

  } catch (error) {
    devLog.error('❌ Error fetching user bookings:', error);
    
    // Return structured error response
    return Response.json({ 
      error: 'Failed to fetch user bookings',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      userAddress 
    }, { status: 500 });
  }
}
