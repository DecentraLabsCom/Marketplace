/**
 * API Route: /api/contract/lab/listLabSSO
 * Lists a lab using server wallet (for SSO users)
 * 
 * @description This endpoint lists a lab token in the marketplace using the server wallet.
 * It calls the `listToken` function on the smart contract, making the lab available for bookings.
 * Only available for SSO users as it uses the server wallet for gas fees.
 * 
 * @param {Request} request - HTTP request with lab listing details
 * @param {Object} request.body - Request body
 * @param {string|number} request.body.labId - Lab identifier to list (required)
 * @returns {Response} JSON response with listing result, transaction hash, or detailed error
 */

import { getContractInstance } from '../../utils/contractInstance'
import { contractAddresses } from '@/contracts/diamond'
import devLog from '@/utils/dev/logger'

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
        message: 'Lab ID is required to list a lab'
      }, { status: 400 });
    }

    // Validate labId is a valid number
    const numericLabId = Number(labId);
    if (isNaN(numericLabId) || numericLabId < 0) {
      return Response.json({ 
        error: 'Invalid lab ID format',
        field: 'labId',
        value: labId,
        message: 'Lab ID must be a valid non-negative number'
      }, { status: 400 });
    }

    devLog.log('🎯 Starting lab listing process via SSO:', { labId: numericLabId });

    // Get contract instance
    const contractInstance = await getContractInstance();
    if (!contractInstance) {
      throw new Error('Failed to get contract instance');
    }

    devLog.log('🔗 Connected to blockchain, calling listToken function...');

    // Call the listToken function on the smart contract
    const transaction = await contractInstance.listToken(numericLabId);
    
    devLog.log('📤 Transaction sent, waiting for confirmation...', {
      hash: transaction.hash,
      labId: numericLabId
    });

    // Wait for transaction confirmation
    const receipt = await transaction.wait();
    
    const processingTime = Date.now() - startTime;
    devLog.log('✅ Lab listed successfully via SSO', {
      labId: numericLabId,
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed?.toString(),
      processingTime: `${processingTime}ms`
    });

    // Return success response with transaction details
    return Response.json({
      success: true,
      labId: numericLabId,
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed?.toString(),
      status: 'listed',
      timestamp: new Date().toISOString(),
      processingTime
    }, { status: 200 });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    devLog.error('❌ Error listing lab via SSO:', error);

    // Handle specific contract errors
    if (error.message?.includes('execution reverted')) {
      const revertReason = error.message.match(/execution reverted: (.*)/)?.[1] || 'Unknown contract error';
      return Response.json({
        error: 'Contract execution failed',
        message: revertReason,
        type: 'CONTRACT_ERROR',
        processingTime
      }, { status: 422 }); // Unprocessable Entity for contract logic errors
    }

    // Handle network/connection errors
    if (error.message?.includes('network') || error.message?.includes('connection')) {
      return Response.json({
        error: 'Blockchain network error',
        message: 'Failed to connect to blockchain network. Please try again.',
        type: 'NETWORK_ERROR',
        processingTime
      }, { status: 503 }); // Service Unavailable
    }

    // Handle gas estimation errors
    if (error.message?.includes('gas') || error.message?.includes('Gas')) {
      return Response.json({
        error: 'Transaction gas error',
        message: 'Failed to estimate or execute transaction gas. The transaction may fail.',
        type: 'GAS_ERROR',
        processingTime
      }, { status: 422 });
    }

    // Generic server error for unexpected issues
    return Response.json({
      error: 'Internal server error',
      message: 'An unexpected error occurred while listing the lab',
      type: 'INTERNAL_ERROR',
      processingTime
    }, { status: 500 });
  }
}
