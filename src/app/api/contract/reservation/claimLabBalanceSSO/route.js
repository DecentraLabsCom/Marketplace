/**
 * API endpoint for claiming LAB token balance for labs (SSO users only)
 * Handles POST requests to claim accumulated LAB tokens for lab providers using server wallet
 * 
 * @description Optimized for React Query with proper validation and blockchain best practices
 * @version 2.0.0 - No server-side cache, React Query friendly with transaction support
 */

import { getContractInstance } from '../../utils/contractInstance'
import { executeBlockchainTransaction } from '@/app/api/contract/utils/retry'

/**
 * Claims LAB token balance for the specified lab using server wallet (for SSO users)
 * @param {Request} request - HTTP request with claim details
 * @param {Object} request.body - Request body
 * @param {string|number} request.body.labId - Lab identifier (required)
 * @returns {Response} JSON response with claim result, transaction hash, or error
 */
export async function POST(request) {
  const startTime = Date.now();
  
  try {
    // Parse and validate request body
    const body = await request.json();
    const { labId } = body;
    
    // Input validation with detailed errors
    if (!labId && labId !== 0) {
      return Response.json({ 
        error: 'Missing required field: labId',
        field: 'labId',
        code: 'VALIDATION_ERROR'
      }, { status: 400 });
    }

    console.log(`[API] claimLabBalanceSSO: Starting claim lab balance for lab ${labId}`);

    // Get contract instance
    const contract = await getContractInstance();
    if (!contract) {
      return Response.json({ 
        error: 'Failed to connect to blockchain',
        code: 'CONNECTION_ERROR'
      }, { status: 500 });
    }

    // Execute claim transaction with retry logic
    console.log(`[API] claimLabBalanceSSO: Executing claim lab balance transaction for lab ${labId}`);
    const result = await executeBlockchainTransaction(
      () => contract.claimLabBalance(labId),
      'claimLabBalance',
      { labId }
    );
    
    const processingTime = Date.now() - startTime;
    console.log(`[API] claimLabBalanceSSO: Successfully claimed lab balance for lab ${labId} in ${processingTime}ms`);
    
    return Response.json({
      success: true,
      result: {
        labId: labId.toString(),
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
    console.error('[API] claimLabBalanceSSO: Claim lab balance failed:', error);

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
      error: 'Internal server error during lab balance claim',
      code: 'INTERNAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Contact support if this persists',
      processingTimeMs: processingTime
    }, { status: 500 });
  }
}

// Handle unsupported HTTP methods
export async function GET() {
  return Response.json({ 
    error: 'Method GET not allowed. Use POST to claim lab balance.',
    allowedMethods: ['POST']
  }, { status: 405 });
}

export async function PUT() {
  return Response.json({ 
    error: 'Method PUT not allowed. Use POST to claim lab balance.',
    allowedMethods: ['POST']
  }, { status: 405 });
}

export async function DELETE() {
  return Response.json({ 
    error: 'Method DELETE not allowed. Use POST to claim lab balance.',
    allowedMethods: ['POST']
  }, { status: 405 });
}

export async function PATCH() {
  return Response.json({ 
    error: 'Method PATCH not allowed. Use POST to claim lab balance.',
    allowedMethods: ['POST']
  }, { status: 405 });
}
