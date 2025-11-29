/**
 * API endpoint for creating new lab reservations (SSO users only)
 * Handles POST requests to book lab time slots through smart contract using server wallet
 * 
 * @description Optimized for React Query with proper error handling and blockchain best practices
 * @version 2.0.0 - No server-side cache, React Query friendly
 */

import { getContractInstance } from '../../utils/contractInstance'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'

/**
 * Creates a new lab booking reservation using server wallet (for SSO users)
 * @param {Request} request - HTTP request with booking details
 * @param {Object} request.body - Request body
 * @param {string|number} request.body.labId - Lab identifier (required)
 * @param {number} request.body.start - Booking start time (Unix timestamp, required)
 * @param {number} request.body.timeslot - Duration of booking in seconds (required)
 * @returns {Response} JSON response with booking result, transaction hash, or detailed error
 */
export async function POST(request) {
  const startTime = Date.now();
  
  try {
    // Authentication check - only authenticated users can make reservations
    await requireAuth();
    
    // Parse and validate request body
    const body = await request.json();
    const { labId, start, timeslot } = body;
    
    // Input validation with detailed errors
    if (!labId && labId !== 0) {
      return Response.json({ 
        error: 'Missing required field: labId',
        field: 'labId',
        code: 'VALIDATION_ERROR'
      }, {status: 400 });
    }
    
    if (!start && start !== 0) {
      return Response.json({ 
        error: 'Missing required field: start',
        field: 'start',
        code: 'VALIDATION_ERROR'
      }, {status: 400 });
    }
    
    if (!timeslot || timeslot <= 0) {
      return Response.json({ 
        error: 'Invalid timeslot: must be a positive number',
        field: 'timeslot',
        code: 'VALIDATION_ERROR'
      }, {status: 400 });
    }

    // Calculate end time
    const end = parseInt(start) + parseInt(timeslot);
    
    // Additional business logic validation
    const now = Math.floor(Date.now() / 1000);
    if (parseInt(start) < now) {
      return Response.json({ 
        error: 'Cannot book in the past',
        field: 'start',
        code: 'VALIDATION_ERROR',
        details: `Start time ${start} is before current time ${now}`
      }, {status: 400 });
    }

    console.log(`[API] makeBookingSSO: Processing booking - labId: ${labId}, start: ${start}, end: ${end}`);

    // Get contract instance
    const contract = await getContractInstance();
    if (!contract) {
      return Response.json({ 
        error: 'Failed to connect to blockchain',
        code: 'CONNECTION_ERROR'
      }, {status: 500 });
    }

    // Execute reservation transaction
    console.log(`[API] makeBookingSSO: Executing reservation request for lab ${labId} from ${start} to ${end}`);
    const result = await contract.reservationRequest(labId, start, end);
    
    const processingTime = Date.now() - startTime;
    console.log(`[API] makeBookingSSO: Successfully created reservation for lab ${labId} in ${processingTime}ms`);
    
    return Response.json({
      result: {
        labId: labId.toString(),
        start: start.toString(),
        end: end.toString(),
        duration: timeslot.toString(),
        transactionHash: result.hash,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed?.toString(),
        effectiveGasPrice: result.effectiveGasPrice?.toString()
      },
      timestamp: new Date().toISOString(),
      processingTimeMs: processingTime
    }, { 
      status: 200
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('[API] makeBookingSSO: Booking creation failed:', error);

    // Handle specific error types
    if (error.message?.includes('execution reverted')) {
      return Response.json({ 
        error: 'Smart contract execution failed',
        code: 'CONTRACT_EXECUTION_ERROR',
        details: error.message,
        processingTimeMs: processingTime
      }, {status: 400 });
    }

    if (error.message?.includes('insufficient funds')) {
      return Response.json({ 
        error: 'Insufficient gas funds for transaction',
        code: 'INSUFFICIENT_FUNDS',
        details: error.message,
        processingTimeMs: processingTime
      }, {status: 400 });
    }

    if (error.message?.includes('nonce')) {
      return Response.json({ 
        error: 'Transaction nonce conflict',
        code: 'NONCE_ERROR',
        details: error.message,
        processingTimeMs: processingTime
      }, {status: 409 });
    }

    // Generic error response
    return Response.json({ 
      error: 'Internal server error during booking creation',
      code: 'INTERNAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Contact support if this persists',
      processingTimeMs: processingTime
    }, {status: 500 });
  }
}

// Handle unsupported HTTP methods
export async function GET() {
  return Response.json({ 
    error: 'Method GET not allowed. Use POST to create bookings.',
    allowedMethods: ['POST']
  }, {status: 405 });
}

export async function PUT() {
  return Response.json({ 
    error: 'Method PUT not allowed. Use POST to create bookings.',
    allowedMethods: ['POST']
  }, {status: 405 });
}

export async function DELETE() {
  return Response.json({ 
    error: 'Method DELETE not allowed. Use POST to create bookings.',
    allowedMethods: ['POST']
  }, {status: 405 });
}

export async function PATCH() {
  return Response.json({ 
    error: 'Method PATCH not allowed. Use POST to create bookings.',
    allowedMethods: ['POST']
  }, {status: 405 });
}
