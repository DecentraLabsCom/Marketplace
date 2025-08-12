import { NextResponse } from 'next/server';
import { getContractInstance } from '../../utils/contractInstance';

/**
 * Get the total supply of reservations
 * GET /api/contract/reservation/totalReservations
 * 
 * @returns {Object} Total number of reservations
 */
export async function GET(request) {
  try {
    const contract = getContractInstance();

    // Call totalReservations function
    const totalReservations = await contract.totalReservations();

    return NextResponse.json({
      totalReservations: totalReservations.toString()
    }, {status: 200});

  } catch (error) {
    console.error('Error getting total reservations:', error);
    return NextResponse.json(
      { error: `Failed to get total reservations: ${error.message}` }, {status: 500 }
    );
  }
}

