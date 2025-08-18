import { NextResponse } from 'next/server';
import { getContractInstance } from '../../utils/contractInstance';

/**
 * Get all reservations in the system
 * GET /api/contract/reservation/getAllReservations
 * DO NOT USE - IT REQUIRES TOO MUCH PROCESSING AND GETS REJECTED NBY RPC NODES
 * 
 * @returns {Object} Array of all reservations
 */
export async function GET(request) {
  try {
    const contract = getContractInstance();

    // Call getAllReservations function
    const reservations = await contract.getAllReservations();

    // Format reservations data
    const formattedReservations = reservations.map(reservation => ({
      labId: reservation.labId?.toString(),
      renter: reservation.renter,
      price: reservation.price?.toString(),
      start: reservation.start?.toString(),
      end: reservation.end?.toString(),
      status: reservation.status?.toString()
    }));

    return NextResponse.json({
      reservations: formattedReservations,
      total: formattedReservations.length
    }, {status: 200});

  } catch (error) {
    console.error('Error getting all reservations:', error);
    return NextResponse.json(
      { error: `Failed to get all reservations: ${error.message}` }, {status: 500 }
    );
  }
}
