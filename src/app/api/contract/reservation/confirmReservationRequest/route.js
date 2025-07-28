/**
 * API endpoint for confirming reservation requests
 * Handles POST requests to approve pending reservation requests
 * Atomic endpoint - only calls confirmReservationRequest contract method
 */

import { getContractInstance } from '../../utils/contractInstance'
import { executeBlockchainTransaction } from '@/app/api/contract/utils/retry'

/**
 * Confirms a reservation request
 * @param {Request} request - HTTP request with reservation details
 * @param {Object} request.body - Request body
 * @param {string} request.body.reservationKey - Unique reservation identifier (required)
 * @returns {Response} JSON response with confirmation result or error
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { reservationKey } = body;
    
    if (!reservationKey) {
      return Response.json({ error: 'Missing reservationKey' }, { status: 400 });
    }

    console.log(`Confirming reservation: ${reservationKey}`);
    
    const contract = await getContractInstance();
    
    // Execute blockchain transaction
    const tx = await executeBlockchainTransaction(() => contract.confirmReservationRequest(reservationKey));
    await tx.wait();
    
    console.log(`✅ Reservation confirmed: ${reservationKey}`);

    return Response.json({ 
      success: true,
      transactionHash: tx.hash,
      reservationKey
    }, { 
      status: 200,
      headers: { 'Cache-Control': 'no-cache' }
    });

  } catch (error) {
    console.error('Error confirming reservation:', error);
    
    return Response.json({ 
      error: 'Failed to confirm reservation',
      details: error.message
    }, { 
      status: 500,
      headers: { 'Cache-Control': 'no-cache' }
    });
  }
}
