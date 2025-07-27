/**
 * API endpoint for retrieving a specific reservation by key
 * Handles GET requests to fetch individual reservation data
 * Optimized for React Query client-side caching - no server-side cache
 */
import devLog from '@/utils/dev/logger'
import { getContractInstance } from '../../utils/contractInstance'
import { retryBlockchainRead } from '@/app/api/contract/utils/retry'

/**
 * Retrieves a specific reservation by its key
 * @param {Request} request - HTTP request with query parameters
 * @param {string} request.searchParams.reservationKey - Reservation key (bytes32 format, required)
 * @returns {Response} JSON response with reservation data or error
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
    devLog.log(`🔍 Fetching reservation: ${reservationKey.slice(0, 10)}...${reservationKey.slice(-8)}`);
    
    const contract = await getContractInstance();

    // Get reservation data from contract
    const reservationData = await retryBlockchainRead(() => contract.getReservation(reservationKey));

    // Contract returns: { labId, renter, price, start, end, status }
    // Status: 0 = PENDING, 1 = BOOKED, 2 = USED, 3 = COLLECTED, 4 = CANCELLED
    const status = Number(reservationData.status);
    const renterAddress = reservationData.renter || '0x0000000000000000000000000000000000000000';
    const exists = renterAddress !== '0x0000000000000000000000000000000000000000';

    // Determine reservation state
    let reservationState = 'Unknown';
    let isConfirmed = false;
    
    if (!exists) {
      reservationState = 'Not Found';
    } else {
      switch (status) {
        case 0:
          reservationState = 'Pending';
          isConfirmed = false;
          break;
        case 1:
          reservationState = 'Booked/Confirmed';
          isConfirmed = true;
          break;
        case 2:
          reservationState = 'Used';
          isConfirmed = true;
          break;
        case 3:
          reservationState = 'Collected';
          isConfirmed = true;
          break;
        case 4:
          reservationState = 'Cancelled';
          isConfirmed = false;
          break;
        default:
          reservationState = 'Unknown Status';
      }
    }

    devLog.log(`✅ Successfully fetched reservation: ${reservationState}`);

    return Response.json({ 
      success: true,
      reservation: {
        labId: reservationData.labId?.toString() || null,
        renter: renterAddress,
        price: reservationData.price?.toString() || null,
        start: reservationData.start?.toString() || null,
        end: reservationData.end?.toString() || null,
        status: status,
        reservationState: reservationState,
        isPending: status === 0,
        isBooked: status === 1,
        isUsed: status === 2,
        isCollected: status === 3,
        isCanceled: status === 4,
        isActive: status === 1, // Only BOOKED reservations are considered "active" for cancellation
        isCompleted: status === 2 || status === 3, // USED or COLLECTED
        isConfirmed: isConfirmed,
        exists: exists
      },
      reservationKey
    }, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache', // Let React Query handle caching
      }
    });

  } catch (error) {
    devLog.error('❌ Error fetching reservation:', error);
    
    return Response.json({ 
      error: 'Failed to fetch reservation',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      reservationKey 
    }, { status: 500 });
  }
}
