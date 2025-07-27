/**
 * API endpoint for retrieving all booking reservations
 * Handles GET requests to fetch all booking data
 * Optimized for React Query client-side caching - no server-side cache
 */
import { getContractInstance } from '../../utils/contractInstance'
import { retryBlockchainRead } from '@/app/api/contract/utils/retry'
import { simBookings } from '@/utils/dev/simBookings'
import devLog from '@/utils/dev/logger'

/**
 * Retrieves all bookings from the blockchain
 * @param {Request} request - HTTP request with optional query parameters
 * @returns {Response} JSON response with bookings array or error
 */
export async function GET(request) {
  try {
    devLog.log('🔍 Fetching all bookings');
    
    const contract = await getContractInstance();
    const blockchainBookings = await retryBlockchainRead(() => contract.getBookings());
    
    // Process and format bookings
    const processedBookings = blockchainBookings.map((booking, index) => {
      const [reservationKey, userAddress, labId, start, end, status] = booking;
      
      return {
        id: index,
        reservationKey: reservationKey.toString(),
        userAddress: userAddress.toString(),
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
      count: processedBookings.length 
    }, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache', // Let React Query handle caching
      }
    });

  } catch (error) {
    devLog.error(' Error fetching all bookings:', error);
    
    // If blockchain fails, try simulation data as fallback
    if (error.message.includes('429') || error.message.includes('rate limit')) {
      try {
        const fallbackBookings = simBookings();
        devLog.log('Using simulation data as fallback for rate limiting');
        return Response.json({ 
          bookings: fallbackBookings,
          count: fallbackBookings.length,
          fallback: true 
        }, { 
          status: 200,
          headers: {
            'X-Fallback-Data': 'true',
            'Cache-Control': 'no-cache'
          }
        });
      } catch (fallbackError) {
        devLog.error('Fallback data also failed:', fallbackError);
      }
    }
    
    return Response.json({ 
      error: 'Failed to fetch bookings',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined 
    }, { status: 500 });
  }
}
