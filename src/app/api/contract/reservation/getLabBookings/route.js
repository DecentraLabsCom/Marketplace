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
    
    // Process and format bookings with validation
    const processedBookings = reservationResults.map((reservation, index) => {
      try {
        const [reservationKey, userAddress, start, end, status] = reservation;
        
        // Validate and convert start/end timestamps
        const startNum = Number(start);
        const endNum = Number(end);
        
        // Check for valid timestamps (must be positive numbers)
        if (isNaN(startNum) || isNaN(endNum) || startNum <= 0 || endNum <= 0) {
          console.warn(`⚠️ Invalid timestamps for booking ${index} in lab ${labId}:`, { start, end });
          return null; // Return null for invalid bookings
        }
        
        const startMillis = startNum * 1000;
        const endMillis = endNum * 1000;
        const startDate = new Date(startMillis);
        const endDate = new Date(endMillis);
        
        // Validate the dates are actually valid
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          console.warn(`⚠️ Invalid date conversion for booking ${index} in lab ${labId}:`, { startNum, endNum });
          return null;
        }
        
        return {
          id: index,
          reservationKey: reservationKey.toString(),
          userAddress: userAddress.toString(),
          labId: numericLabId, // Include labId for proper filtering
          start: startNum.toString(),
          end: endNum.toString(),
          status: status.toString(),
          startDate: startDate,
          endDate: endDate,
          date: startDate.toLocaleDateString('en-CA'), // Add date field for filtering (YYYY-MM-DD format)
          duration: endNum - startNum,
          isActive: Date.now() >= startMillis && Date.now() < endMillis,
          renter: userAddress.toString() // Alias for consistency
        };
      } catch (error) {
        console.warn(`⚠️ Error processing booking ${index} in lab ${labId}:`, error);
        return null;
      }
    }).filter(booking => booking !== null); // Remove null bookings

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
