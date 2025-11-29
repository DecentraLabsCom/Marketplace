/**
 * API Route: /api/contract/lab/deleteLabSSO
 * Deletes a lab using server wallet (for SSO users)
 * 
 * @description This endpoint deletes a lab from the marketplace using the server wallet.
 * It calls the `deleteLab` function on the smart contract, burning the lab NFT.
 * Only available for authenticated SSO users who own the lab.
 * Cannot delete labs with uncollected reservations (CONFIRMED, IN_USE, or COMPLETED).
 * 
 * @param {Request} request - HTTP request with lab deletion details
 * @param {Object} request.body - Request body
 * @param {string|number} request.body.labId - Lab identifier to delete (required)
 * @returns {Response} JSON response with deletion result and transaction hash
 */

import { getContractInstance } from '../../utils/contractInstance'
import devLog from '@/utils/dev/logger'
import { requireAuth, requireLabOwner, handleGuardError } from '@/utils/auth/guards'

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
        message: 'Lab ID is required to delete a lab'
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

    // Authentication and authorization - only lab owner can delete
    const session = await requireAuth();
    await requireLabOwner(session, numericLabId);

    devLog.log('🎯 Starting lab deletion process via SSO:', { 
      labId: numericLabId,
      userAddress: session.address 
    });

    // Get contract instance
    const contractInstance = await getContractInstance();
    if (!contractInstance) {
      throw new Error('Failed to get contract instance');
    }

    devLog.log('🔗 Connected to blockchain, calling deleteLab function...');

    // Call the deleteLab function on the smart contract
    const transaction = await contractInstance.deleteLab(numericLabId);
    
    devLog.log('📤 Transaction sent, waiting for confirmation...', {
      hash: transaction.hash,
      labId: numericLabId
    });

    // Wait for transaction confirmation
    const receipt = await transaction.wait();
    
    const processingTime = Date.now() - startTime;
    devLog.log('✅ Lab deleted successfully via SSO', {
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
      status: 'deleted',
      timestamp: new Date().toISOString(),
      processingTime
    }, { status: 200 });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    devLog.error('❌ Error deleting lab via SSO:', error);

    // Handle guard errors (401, 403) separately from other errors
    if (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError') {
      return handleGuardError(error);
    }

    // Handle specific contract errors
    if (error.message?.includes('execution reverted')) {
      const revertReason = error.message.match(/execution reverted: (.*)/)?.[1] || 'Unknown contract error';
      
      // Handle specific case: lab has uncollected reservations
      if (revertReason.includes('uncollected reservations')) {
        return Response.json({
          error: 'Cannot delete lab',
          message: 'This lab has uncollected reservations (CONFIRMED, IN_USE, or COMPLETED). Please collect all pending funds before deleting.',
          type: 'BUSINESS_RULE_ERROR',
          processingTime
        }, { status: 409 }); // Conflict - resource has conflicting state
      }

      return Response.json({
        error: 'Contract execution failed',
        message: revertReason,
        type: 'CONTRACT_ERROR',
        processingTime
      }, { status: 422 }); // Unprocessable Entity for contract logic errors
    }

    // Handle "token owner" errors
    if (error.message?.includes('Token owner') || error.message?.includes('onlyTokenOwner')) {
      return Response.json({
        error: 'Authorization failed',
        message: 'Only the lab owner can delete this lab.',
        type: 'AUTHORIZATION_ERROR',
        processingTime
      }, { status: 403 });
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
      message: 'An unexpected error occurred while deleting the lab',
      type: 'INTERNAL_ERROR',
      processingTime
    }, { status: 500 });
  }
}
