import { NextResponse } from 'next/server';
import { getContractInstance } from '../../utils/contractInstance';
import { requireAuth, handleGuardError } from '@/utils/auth/guards';

/**
 * Get user address who owns a reservation
 * GET /api/contract/reservation/userOfReservation?reservationKey=0x123
 * 
 * @security Protected - requires authenticated session
 * Query Parameters:
 * @param {string} reservationKey - Reservation key (bytes32)
 * 
 * @returns {Object} User address who owns the reservation
 */
export async function GET(request) {
  try {
    // Authentication check - personal data requires login
    await requireAuth();
  } catch (error) {
    return handleGuardError(error);
  }

  try {
    const { searchParams } = new URL(request.url);
    const reservationKey = searchParams.get('reservationKey');

    if (!reservationKey) {
      return NextResponse.json(
        { error: 'Missing required parameter: reservationKey' }, {status: 400 }
      );
    }

    const contract = await getContractInstance();

    // Call userOfReservation function
    const userAddress = await contract.userOfReservation(reservationKey);

    return NextResponse.json({
      reservationKey: reservationKey,
      userAddress: userAddress
    }, {status: 200});

  } catch (error) {
    console.error('Error getting user of reservation:', error);
    return NextResponse.json(
      { error: `Failed to get user of reservation: ${error.message}` }, {status: 500 }
    );
  }
}

