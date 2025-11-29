/**
 * API endpoint for canceling reservation requests (SSO users only)
 * Handles POST requests to cancel pending reservation requests through smart contract using server wallet
 * 
 * @description Optimized for React Query with proper validation and blockchain best practices
 * @version 2.0.0 - No server-side cache, React Query friendly with transaction support
 */

import { getContractInstance } from '../../utils/contractInstance'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'

/**
 * Cancels a pending reservation request using server wallet (for SSO users)
 * @param {Request} request - HTTP request with cancellation details
 * @param {Object} request.body - Request body
 * @param {string} request.body.reservationKey - Unique reservation identifier (bytes32, required)
 * @param {boolean} [request.body.validateOnly=false] - If true, only validates without executing transaction
 * @returns {Response} JSON response with cancellation result, transaction hash, or error
 */
export async function POST(request) {
  const startTime = Date.now();
  
  try {
    // Authentication check - only authenticated users can cancel requests
    await requireAuth();
    
    // Parse and validate request body
    const body = await request.json();
    const { reservationKey, validateOnly = false } = body;
    
    // Input validation with detailed errors
    if (!reservationKey) {
      return Response.json({ 
        error: 'Missing required field: reservationKey',
        field: 'reservationKey',
        code: 'VALIDATION_ERROR'
      }, {status: 400 });
    }

    // Ensure reservationKey is a string
    const reservationKeyStr = String(reservationKey);

    // Validate reservationKey format (should be bytes32)
    if (!reservationKeyStr.startsWith('0x') || reservationKeyStr.length !== 66) {
      return Response.json({ 
        error: 'Invalid reservationKey format: must be a 32-byte hex string starting with 0x',
        field: 'reservationKey',
        code: 'VALIDATION_ERROR',
        expected: '0x followed by 64 hex characters',
        received: reservationKeyStr
      }, {status: 400 });
    }

    console.log(`[API] cancelRequestSSO: Processing cancellation request - reservationKey: ${reservationKeyStr}, validateOnly: ${validateOnly}`);

    // If only validation requested, return early
    if (validateOnly) {
      return Response.json({
        data: {
          reservationKey: reservationKeyStr,
          validated: true
        },
        timestamp: new Date().toISOString()
      });
    }

    // Get contract instance
    const contract = await getContractInstance();
    if (!contract) {
      return Response.json({ 
        error: 'Failed to connect to blockchain',
        code: 'CONNECTION_ERROR'
      }, {status: 500 });
    }

    // Execute cancellation transaction with retry logic
    console.log(`[API] cancelRequestSSO: Executing request cancellation for: ${reservationKeyStr}`);
    const result = await contract.cancelReservationRequest(reservationKeyStr);

    const processingTime = Date.now() - startTime;
    console.log(`[API] cancelRequestSSO: Successfully cancelled request ${reservationKeyStr} in ${processingTime}ms`);
    
    return Response.json({
      result: {
        reservationKey: reservationKeyStr,
        transactionHash: result.hash,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed?.toString(),
        effectiveGasPrice: result.effectiveGasPrice?.toString()
      },
      timestamp: new Date().toISOString(),
      processingTimeMs: processingTime
    }, {status: 200,
      headers: {
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('[API] cancelRequestSSO: Request cancellation failed:', error);

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
      error: 'Internal server error during request cancellation',
      code: 'INTERNAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Contact support if this persists',
      processingTimeMs: processingTime
    }, {status: 500 });
  }
}

// Handle unsupported HTTP methods
export async function GET() {
  return Response.json({ 
    error: 'Method GET not allowed. Use POST to cancel reservation requests.',
    allowedMethods: ['POST']
  }, {status: 405 });
}

export async function PUT() {
  return Response.json({ 
    error: 'Method PUT not allowed. Use POST to cancel reservation requests.',
    allowedMethods: ['POST']
  }, {status: 405 });
}

export async function DELETE() {
  return Response.json({ 
    error: 'Method DELETE not allowed. Use POST to cancel reservation requests.',
    allowedMethods: ['POST']
  }, {status: 405 });
}

export async function PATCH() {
  return Response.json({ 
    error: 'Method PATCH not allowed. Use POST to cancel reservation requests.',
    allowedMethods: ['POST']
  }, {status: 405 });
}
