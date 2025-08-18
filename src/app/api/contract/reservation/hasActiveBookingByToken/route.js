import { NextResponse } from 'next/server';
import { getContractInstance } from '../../utils/contractInstance';

/**
 * Check if user has active booking by token
 * GET /api/contract/reservation/hasActiveBookingByToken?tokenId=123&user=0x123...
 * 
 * Query Parameters:
 * @param {number|string} tokenId - ID of the token
 * @param {string} user - User address to check
 * 
 * @returns {Object} Whether the user has an active booking for the token
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const tokenId = searchParams.get('tokenId');
    const user = searchParams.get('user');

    if (!tokenId || !user) {
      return NextResponse.json(
        { error: 'Missing required parameters: tokenId and user' }, {status: 400 }
      );
    }

    const contract = getContractInstance();

    // Call hasActiveBookingByToken function
    const result = await contract.hasActiveBookingByToken(tokenId, user);

    return NextResponse.json({
      tokenId: tokenId,
      user: user,
      hasActiveBooking: result
    }, {status: 200});

  } catch (error) {
    console.error('Error checking active booking by token:', error);
    return NextResponse.json(
      { error: `Failed to check active booking by token: ${error.message}` }, {status: 500 }
    );
  }
}



