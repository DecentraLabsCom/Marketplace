/**
 * API endpoint for denying reservation requests
 * Handles POST requests to deny pending reservation requests
 * Atomic endpoint - only calls denyReservationRequest contract method
 */

import { getContractInstance } from '../../utils/contractInstance'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'

/**
 * Denies a reservation request
 * @param {Request} request - HTTP request with reservation details
 * @param {Object} request.body - Request body
 * @param {string} request.body.reservationKey - Unique reservation identifier (required)
 * @param {string} [request.body.reason] - Reason for denial (optional)
 * @returns {Response} JSON response with denial result or error
 */
export async function POST(request) {
  try {
    // Authentication check - only authenticated users can deny reservations
    // (on-chain contract verifies the caller is the lab owner/provider)
    await requireAuth();
    
    const body = await request.json();
    const { reservationKey, reason = 'Denied by provider' } = body;
    
    if (!reservationKey) {
      return Response.json({ error: 'Missing reservationKey' }, {status: 400 });
    }

    console.log(`Denying reservation: ${reservationKey}, reason: ${reason}`);
    
    const contract = await getContractInstance();
    
    // Execute blockchain transaction
    const tx = await contract.denyReservationRequest(reservationKey);
    await tx.wait();
    
    console.log(`✅ Reservation denied: ${reservationKey}`);

    return Response.json({ 
      transactionHash: tx.hash,
      reservationKey,
      reason
    }, {status: 200});

  } catch (error) {
    // Handle guard errors (401, 403) separately from other errors
    if (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError') {
      return handleGuardError(error);
    }
    
    console.error('Error denying reservation:', error);
    
    return Response.json({ 
      error: 'Failed to deny reservation',
      details: error.message
    }, {status: 500 });
  }
}
