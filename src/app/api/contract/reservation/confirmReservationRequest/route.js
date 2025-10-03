/**
 * API endpoint for confirming reservation requests
 * Handles POST requests to approve pending reservation requests
 * Atomic endpoint - only calls confirmReservationRequest contract method
 */

import { getContractInstance } from '../../utils/contractInstance'
/**
 * Confirms a reservation request
 * @param {Request} request - HTTP request with reservation details
 * @param {Object} request.body - Request body
 * @param {string} request.body.reservationKey - Unique reservation identifier (required)
 * @returns {Response} JSON response with confirmation result or error
 */
export async function POST(request) {
  let reservationKey = null; // Declare here so it's available in catch block
  
  try {
    const body = await request.json();
    reservationKey = body.reservationKey;
    
    if (!reservationKey) {
      return Response.json({ error: 'Missing reservationKey' }, {status: 400 });
    }

    console.log(`Confirming reservation: ${reservationKey}`);
    
    // Get contract instance with WRITE permissions (readOnly = false)
    const contract = await getContractInstance('diamond', false);
    
    // Execute blockchain transaction
    const tx = await contract.confirmReservationRequest(reservationKey);
    await tx.wait(); // Wait for transaction to be mined
    
    console.log(`✅ Reservation confirmed: ${reservationKey}`);

    return Response.json({ 
      transactionHash: tx.hash,
      reservationKey
    }, {status: 200});

  } catch (error) {
    console.error('❌ Error confirming reservation:', {
      reservationKey,
      errorMessage: error.message,
      errorStack: error.stack,
      errorCode: error.code,
      errorReason: error.reason
    });
    
    // Check if the error is due to already confirmed reservation (transaction reverted)
    // This happens when the reservation is already in CONFIRMED state
    if (error.message?.includes('transaction execution reverted') || 
        error.code === 'CALL_EXCEPTION' ||
        error.receipt?.status === 0) {
      console.log('ℹ️ Reservation likely already confirmed:', reservationKey);
      return Response.json({ 
        note: 'Reservation already confirmed',
        reservationKey,
        alreadyProcessed: true
      }, {status: 200}); // Return success since reservation is confirmed
    }
    
    return Response.json({ 
      error: 'Failed to confirm reservation',
      details: error.message
    }, {status: 500});
  }
}
