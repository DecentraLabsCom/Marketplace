/**
 * API endpoint for retrieving all bookings for a specific lab
 * Handles GET requests to fetch lab-specific booking data
 */
import devLog from '@/utils/dev/logger'
import { getContractInstance } from '../../utils/contractInstance'
import { retryBlockchainRead } from '@/app/api/contract/utils/retry'

/**
 * Retrieves all bookings for a specific lab
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.labId - Lab ID to fetch bookings for (required)
 * @returns {Response} JSON response with lab's booking array or error
 */
export async function GET(request) {
  const url = new URL(request.url);
  const labId = url.searchParams.get('labId');
  
  if (!labId) {
    return Response.json({ 
      error: 'Missing labId parameter' 
    }, { status: 400 });
  }

  // Validate labId is a valid number
  const numericLabId = Number(labId);
  if (isNaN(numericLabId) || numericLabId < 0) {
    return Response.json({ 
      error: 'Invalid labId format - must be a positive number',
      providedLabId: labId 
    }, { status: 400 });
  }

  try {
    devLog.log(`🔍 Fetching bookings for lab: ${labId}`);
    
    const contract = await getContractInstance();
    const blockchainBookings = await retryBlockchainRead(() => contract.getLabBookings(numericLabId));
    
    // Process and format bookings
    const processedBookings = blockchainBookings.map((booking, index) => {
      const [reservationKey, userAddress, start, end, status] = booking;
      
      return {
        id: index,
        reservationKey: reservationKey.toString(),
        userAddress: userAddress.toString(),
        start: start.toString(),
        end: end.toString(),
        status: status.toString(),
        startDate: new Date(Number(start) * 1000),
        endDate: new Date(Number(end) * 1000),
        duration: Number(end) - Number(start),
        isActive: Date.now() >= Number(start) * 1000 && Date.now() < Number(end) * 1000,
      };
    });

    devLog.log(`✅ Successfully fetched ${processedBookings.length} bookings for lab ${labId}`);
    
    return Response.json({ 
      bookings: processedBookings,
      count: processedBookings.length,
      labId: numericLabId 
    }, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache', // Let React Query handle caching
      }
    });

  } catch (error) {
    devLog.error(`❌ Error fetching bookings for lab ${labId}:`, error);
    
    // Return structured error response
    return Response.json({ 
      error: 'Failed to fetch lab bookings',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      labId: numericLabId 
    }, { status: 500 });
  }
}
