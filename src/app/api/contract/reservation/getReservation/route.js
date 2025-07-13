import { getContractInstance } from '../../utils/contractInstance';
import retry from '@/utils/retry';

export async function POST(request) {
  try {
    const body = await request.json();
    const { reservationKey } = body;
    
    if (!reservationKey) {
      return Response.json({ error: 'Missing reservationKey' }, { status: 400 });
    }

    // Validate reservationKey format (should be bytes32)
    if (!reservationKey.startsWith('0x') || reservationKey.length !== 66) {
      return Response.json({ error: 'Invalid reservationKey format' }, { status: 400 });
    }

    const contract = await getContractInstance();

    // Get reservation data from contract
    const reservationData = await retry(() => contract.getReservation(reservationKey));

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
      }
    }, { status: 200 });

  } catch (error) {
    console.error('Error fetching reservation:', error);
    
    return Response.json({ 
      error: 'Failed to fetch reservation',
      details: error.message 
    }, { status: 500 });
  }
}
