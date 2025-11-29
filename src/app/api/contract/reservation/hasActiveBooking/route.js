import { NextResponse } from 'next/server';
import { getContractInstance } from '../../utils/contractInstance';
import { requireAuth, handleGuardError } from '@/utils/auth/guards';

/**
 * Check if user has active booking for a reservation
 * GET /api/contract/reservation/hasActiveBooking?reservationKey=0x123&userAddress=0xabc
 * 
 * @security Protected - requires authenticated session
 * Query Parameters:
 * @param {string} reservationKey - Reservation key (bytes32)
 * @param {string} userAddress - User wallet address
 * 
 * @returns {Object} Active booking status
 */
export async function GET(request) {
  try {
    // Authentication check - booking status is personal data
    await requireAuth();
  } catch (error) {
    return handleGuardError(error);
  }

  try {
    const { searchParams } = new URL(request.url);
    const reservationKey = searchParams.get('reservationKey');
    const userAddress = searchParams.get('userAddress');

    if (!reservationKey || !userAddress) {
      return NextResponse.json(
        { error: 'Missing required parameters: reservationKey, userAddress' }, {status: 400 }
      );
    }

    const contract = getContractInstance();

    // Call hasActiveBooking function
    const result = await contract.hasActiveBooking(reservationKey, userAddress);

    return NextResponse.json({
      reservationKey: reservationKey,
      userAddress: userAddress,
      hasActiveBooking: result
    }, {status: 200});

  } catch (error) {
    console.error('Error checking active booking:', error);
    return NextResponse.json(
      { error: `Failed to check active booking: ${error.message}` }, {status: 500 }
    );
  }
}


