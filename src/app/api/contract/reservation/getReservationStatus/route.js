/**
 * API endpoint for retrieving reservation status by key
 * Handles GET requests to fetch reservation status information
 * Optimized for React Query client-side caching - no server-side cache
 */

import { getContractInstance } from '../../utils/contractInstance'
import { retryBlockchainRead } from '@/app/api/contract/utils/retry'

/**
 * Retrieves the status of a specific reservation
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.reservationKey - Reservation key (bytes32 format, required)
 * @returns {Response} JSON response with reservation status or error
 */
export async function GET(request) {
  const url = new URL(request.url);
  const reservationKey = url.searchParams.get('reservationKey');
  
  if (!reservationKey) {
    return Response.json({ 
      error: 'Missing reservationKey parameter' 
    }, { status: 400 });
  }

  // Validate reservationKey format (should be bytes32)
  if (!reservationKey.startsWith('0x') || reservationKey.length !== 66) {
    return Response.json({ 
      error: 'Invalid reservationKey format - must be bytes32 (0x + 64 hex chars)',
      providedKey: reservationKey 
    }, { status: 400 });
  }

  try {
    console.log(`🔍 Checking status for reservation: ${reservationKey.slice(0, 10)}...${reservationKey.slice(-8)}`);
    
    const contract = await getContractInstance();
    
    // Get reservation status from contract
    const reservation = await retryBlockchainRead(() => contract.getReservation(reservationKey));
    
    if (!reservation) {
      return Response.json({ 
        error: 'Reservation not found',
        reservationKey 
      }, { status: 404 });
    }
    
    // Parse reservation data
    const status = Number(reservation.status);
    const reservationData = {
      key: reservationKey,
      labId: reservation.labId.toString(),
      renter: reservation.renter || reservation.user, // Handle both property names
      start: reservation.start.toString(),
      end: reservation.end.toString(),
      status: status,
      price: reservation.price?.toString() || null,
      createdAt: reservation.createdAt ? reservation.createdAt.toString() : null,
      processedAt: reservation.processedAt ? reservation.processedAt.toString() : null,
      // Add status descriptions
      statusText: getStatusText(status),
      isPending: status === 0,
      isBooked: status === 1,
      isUsed: status === 2,
      isCollected: status === 3,
      isCancelled: status === 4
    };

    console.log(`✅ Retrieved reservation status: ${getStatusText(status)}`);
    
    return Response.json({ 
      success: true,
      reservation: reservationData
    }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache', // Let React Query handle caching
      }
    });
    
  } catch (error) {
    console.error('❌ Error getting reservation status:', error);
    return Response.json({ 
      error: 'Failed to get reservation status',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      reservationKey 
    }, { status: 500 });
  }
}

/**
 * Helper function to get human-readable status text
 * @param {number} status - Numeric status from contract
 * @returns {string} Human-readable status
 */
function getStatusText(status) {
  switch (status) {
    case 0: return 'Pending';
    case 1: return 'Booked';
    case 2: return 'Used';
    case 3: return 'Collected';
    case 4: return 'Cancelled';
    default: return 'Unknown';
  }
}
