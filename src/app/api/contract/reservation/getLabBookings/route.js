/**
 * API endpoint for retrieving all bookings for a specific lab
 * Handles GET requests to fetch lab-specific booking data
 */

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
    console.log(`🔍 Fetching bookings for lab: ${labId}`);
    
    const contract = await getContractInstance();
    
    // Step 1: Get total number of reservations for this lab
    const reservationsCount = await retryBlockchainRead(() => contract.getReservationsOfToken(numericLabId));
    const totalReservations = Number(reservationsCount);
    
    console.log(`📊 Lab ${labId} has ${totalReservations} total reservations`);
    
    if (totalReservations === 0) {
      return Response.json({ 
        bookings: [],
        count: 0,
        labId: numericLabId 
      }, { 
        status: 200,
        headers: { 'Cache-Control': 'no-cache' }
      });
    }
    
    // Step 2: Get all reservations for this lab in parallel
    const reservationPromises = Array.from({ length: totalReservations }, (_, index) =>
      retryBlockchainRead(() => contract.getReservationOfTokenByIndex(numericLabId, index))
    );
    
    const reservationResults = await Promise.all(reservationPromises);
    console.log(`📝 Retrieved ${reservationResults.length} lab reservations`);
    
    // Process and format bookings
    const processedBookings = reservationResults.map((reservation, index) => {
      const [reservationKey, userAddress, start, end, status] = reservation;
      
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

    console.log(`✅ Successfully fetched ${processedBookings.length} bookings for lab ${labId}`);
    
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
    console.error(`❌ Error fetching bookings for lab ${labId}:`, error);
    
    // Return structured error response
    return Response.json({ 
      error: 'Failed to fetch lab bookings',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      labId: numericLabId 
    }, { status: 500 });
  }
}
