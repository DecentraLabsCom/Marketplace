/**
 * API endpoint for claiming refunds on canceled or denied reservations (SSO users only)
 * Handles POST requests to process refund claims through smart contract using server wallet
 * 
 * @description Optimized for React Query with proper validation and blockchain best practices
 * @version 2.0.0 - No server-side cache, React Query friendly with transaction support
 */

import { getContractInstance } from '../../utils/contractInstance'
import { executeBlockchainTransaction } from '@/app/api/contract/utils/retry'

/**
 * Claims refund for eligible canceled or denied reservations using server wallet (for SSO users)
 * @param {Request} request - HTTP request for refund claim
 * @param {Object} request.body - Request body
 * @param {string} request.body.reservationKey - Unique reservation identifier (bytes32, required)
 * @returns {Response} JSON response with refund claim result, transaction hash, or error
 */
export async function POST(request) {
  const startTime = Date.now();
  
  try {
    // Parse and validate request body
    const body = await request.json();
    const { reservationKey } = body;
    
    // Input validation with detailed errors
    if (!reservationKey) {
      return Response.json({ 
        error: 'Missing required field: reservationKey',
        field: 'reservationKey',
        code: 'VALIDATION_ERROR'
      }, { status: 400 });
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
      }, { status: 400 });
    }

    console.log(`[API] claimRefundSSO: Starting refund claim for reservation ${reservationKeyStr}`);

    // Get contract instance
    const contract = await getContractInstance();
    if (!contract) {
      return Response.json({ 
        error: 'Failed to connect to blockchain',
        code: 'CONNECTION_ERROR'
      }, { status: 500 });
    }

    // Execute refund claim transaction with retry logic
    console.log(`[API] claimRefundSSO: Executing refund claim transaction for reservation ${reservationKeyStr}`);
    const result = await executeBlockchainTransaction(
      () => contract.claimRefund(reservationKeyStr),
      'claimRefund',
      { reservationKey: reservationKeyStr }
    );
    
    const processingTime = Date.now() - startTime;
    console.log(`[API] claimRefundSSO: Successfully claimed refund for reservation ${reservationKeyStr} in ${processingTime}ms`);
    
    return Response.json({
      success: true,
      result: {
        reservationKey: reservationKeyStr,
        transactionHash: result.hash,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed?.toString(),
        effectiveGasPrice: result.effectiveGasPrice?.toString()
      },
      timestamp: new Date().toISOString(),
      processingTimeMs: processingTime
    }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('[API] claimRefundSSO: Refund claim failed:', error);

    // Handle specific error types
    if (error.message?.includes('execution reverted')) {
      return Response.json({ 
        error: 'Smart contract execution failed',
        code: 'CONTRACT_EXECUTION_ERROR',
        details: error.message,
        processingTimeMs: processingTime
      }, { status: 400 });
    }

    if (error.message?.includes('insufficient funds')) {
      return Response.json({ 
        error: 'Insufficient gas funds for transaction',
        code: 'INSUFFICIENT_FUNDS',
        details: error.message,
        processingTimeMs: processingTime
      }, { status: 400 });
    }

    if (error.message?.includes('nonce')) {
      return Response.json({ 
        error: 'Transaction nonce conflict',
        code: 'NONCE_ERROR',
        details: error.message,
        processingTimeMs: processingTime
      }, { status: 409 });
    }

    // Generic error response
    return Response.json({ 
      error: 'Internal server error during refund claim',
      code: 'INTERNAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Contact support if this persists',
      processingTimeMs: processingTime
    }, { status: 500 });
  }
}

// Handle unsupported HTTP methods
export async function GET() {
  return Response.json({ 
    error: 'Method GET not allowed. Use POST to claim refunds.',
    allowedMethods: ['POST']
  }, { status: 405 });
}

export async function PUT() {
  return Response.json({ 
    error: 'Method PUT not allowed. Use POST to claim refunds.',
    allowedMethods: ['POST']
  }, { status: 405 });
}

export async function DELETE() {
  return Response.json({ 
    error: 'Method DELETE not allowed. Use POST to claim refunds.',
    allowedMethods: ['POST']
  }, { status: 405 });
}

export async function PATCH() {
  return Response.json({ 
    error: 'Method PATCH not allowed. Use POST to claim refunds.',
    allowedMethods: ['POST']
  }, { status: 405 });
}
