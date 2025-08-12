/**
 * API endpoint for requesting funds from reservations (SSO users only)
 * Handles POST requests to request funds through smart contract using server wallet
 * 
 * @description Atomic operation for fund requests - optimized for React Query
 * @version 1.0.0 - No server-side cache, React Query friendly with transaction support
 */

import { getContractInstance } from '../../utils/contractInstance'

/**
 * Requests funds from reservations using server wallet (for SSO users)
 * @param {Request} request - HTTP request (no body parameters required)
 * @returns {Response} JSON response with request result, transaction hash, or error
 */
export async function POST(request) {
  const startTime = Date.now();
  
  try {
    console.log(`[API] requestFundsSSO: Starting fund request operation`);

    // Get contract instance
    const contract = await getContractInstance();
    if (!contract) {
      return Response.json({ 
        error: 'Failed to connect to blockchain',
        code: 'CONNECTION_ERROR'
      }, {status: 500 });
    }

    // Execute fund request transaction
    console.log(`[API] requestFundsSSO: Executing fund request transaction`);
    const result = await contract.requestFunds();

    const processingTime = Date.now() - startTime;
    console.log(`[API] requestFundsSSO: Successfully requested funds in ${processingTime}ms`);
    
    return Response.json({
      result: {
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
    console.error('[API] requestFundsSSO: Fund request failed:', error);

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
      error: 'Internal server error during fund request',
      code: 'INTERNAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Contact support if this persists',
      processingTimeMs: processingTime
    }, {status: 500 });
  }
}

// Handle unsupported HTTP methods
export async function GET() {
  return Response.json({ 
    error: 'Method GET not allowed. Use POST to request funds.',
    allowedMethods: ['POST']
  }, {status: 405 });
}

export async function PUT() {
  return Response.json({ 
    error: 'Method PUT not allowed. Use POST to request funds.',
    allowedMethods: ['POST']
  }, {status: 405 });
}

export async function DELETE() {
  return Response.json({ 
    error: 'Method DELETE not allowed. Use POST to request funds.',
    allowedMethods: ['POST']
  }, {status: 405 });
}

export async function PATCH() {
  return Response.json({ 
    error: 'Method PATCH not allowed. Use POST to request funds.',
    allowedMethods: ['POST']
  }, {status: 405 });
}
