import { NextResponse } from 'next/server';
import { getContractInstance } from '../../utils/contractInstance';

/**
 * Get reservation key by global index
 * GET /api/contract/reservation/reservationKeyByIndex?index=0
 * 
 * Query Parameters:
 * @param {number|string} index - Global index of the reservation
 * 
 * @returns {Object} Reservation key at the specified index
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const index = searchParams.get('index');

    if (index === null || index === undefined) {
      return NextResponse.json(
        { error: 'Missing required parameter: index' }, {status: 400 }
      );
    }

    const contract = getContractInstance();

    // Call reservationKeyByIndex function
    const result = await contract.reservationKeyByIndex(index);

    return NextResponse.json({
      index: index,
      reservationKey: result
    }, {status: 200});

  } catch (error) {
    console.error('Error getting reservation key by index:', error);
    return NextResponse.json(
      { error: `Failed to get reservation key by index: ${error.message}` }, {status: 500 }
    );
  }
}



