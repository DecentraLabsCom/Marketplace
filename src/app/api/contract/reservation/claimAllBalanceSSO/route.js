/**
 * API endpoint for claiming all available LAB token balance (SSO users only)
 * Handles POST requests to withdraw all accumulated LAB tokens from smart contract using server wallet
 * 
 * @description Optimized for React Query with proper validation and blockchain best practices
 * @version 2.0.0 - No server-side cache, React Query friendly with transaction support
 */

import { getContractInstance } from '../../utils/contractInstance'
import { executeBlockchainTransaction } from '@/app/api/contract/utils/retry'

/**
 * Claims all available LAB token balance using server wallet (for SSO users)
 * @param {Request} request - HTTP request for balance claim
 * @returns {Response} JSON response with balance claim result, transaction hash, or error
 */
export async function POST(request) {
  const startTime = Date.now();
  
  try {
    console.log(`[API] claimAllBalanceSSO: Starting claim all balance operation`);

    // Get contract instance
    const contract = await getContractInstance();
    if (!contract) {
      return Response.json({ 
        error: 'Failed to connect to blockchain',
        code: 'CONNECTION_ERROR'
      }, { status: 500 });
    }

    // Execute claim transaction with retry logic
    console.log(`[API] claimAllBalanceSSO: Executing claim all balance transaction`);
    const result = await executeBlockchainTransaction(
      () => contract.claimAllBalance(),
      'claimAllBalance',
      {}
    );
    
    const processingTime = Date.now() - startTime;
    console.log(`[API] claimAllBalanceSSO: Successfully claimed all balance in ${processingTime}ms`);
    
    return Response.json({
      success: true,
      result: {
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
    console.error('[API] claimAllBalanceSSO: Claim all balance failed:', error);

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
      error: 'Internal server error during balance claim',
      code: 'INTERNAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Contact support if this persists',
      processingTimeMs: processingTime
    }, { status: 500 });
  }
}

// Handle unsupported HTTP methods
export async function GET() {
  return Response.json({ 
    error: 'Method GET not allowed. Use POST to claim all balance.',
    allowedMethods: ['POST']
  }, { status: 405 });
}

export async function PUT() {
  return Response.json({ 
    error: 'Method PUT not allowed. Use POST to claim all balance.',
    allowedMethods: ['POST']
  }, { status: 405 });
}

export async function DELETE() {
  return Response.json({ 
    error: 'Method DELETE not allowed. Use POST to claim all balance.',
    allowedMethods: ['POST']
  }, { status: 405 });
}

export async function PATCH() {
  return Response.json({ 
    error: 'Method PATCH not allowed. Use POST to claim all balance.',
    allowedMethods: ['POST']
  }, { status: 405 });
}
