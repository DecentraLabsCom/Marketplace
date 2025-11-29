/**
 * API Route: /api/contract/lab/updateLabSSO
 * Updates an existing lab using server wallet (for SSO users)
 * 
 * @description This endpoint updates a lab in the marketplace using the server wallet.
 * It calls the `updateLab` function on the smart contract.
 * Only available for authenticated SSO users who own the lab.
 * 
 * @param {Request} request - HTTP request with lab update details
 * @param {Object} request.body - Request body
 * @param {string|number} request.body.labId - Lab identifier to update (required)
 * @param {Object} request.body.labData - Lab data to update (required)
 * @param {string} request.body.labData.uri - Lab metadata URI (required)
 * @param {string|number} request.body.labData.price - Lab price in contract units (required)
 * @param {string} request.body.labData.auth - Authentication service URI (required)
 * @param {string} request.body.labData.accessURI - Lab access URI (required)
 * @param {string} request.body.labData.accessKey - Lab access key (required)
 * @returns {Response} JSON response with update result and transaction hash
 */

import { getContractInstance } from '../../utils/contractInstance'
import devLog from '@/utils/dev/logger'
import { requireAuth, requireLabOwner, handleGuardError } from '@/utils/auth/guards'

export async function POST(request) {
  const startTime = Date.now();
  
  try {
    // Parse and validate request body
    const body = await request.json();
    const { labId, labData } = body;
    
    // Input validation with detailed errors
    if (!labId && labId !== 0) {
      return Response.json({ 
        error: 'Missing required field: labId',
        field: 'labId',
        message: 'Lab ID is required to update a lab'
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

    if (!labData) {
      return Response.json({ 
        error: 'Missing required field: labData',
        field: 'labData',
        message: 'Lab data object is required'
      }, { status: 400 });
    }

    const { uri, price, auth, accessURI, accessKey } = labData;

    if (!uri) {
      return Response.json({ 
        error: 'Missing required field: labData.uri',
        field: 'uri',
        message: 'Lab metadata URI is required'
      }, { status: 400 });
    }

    if (price === undefined || price === null) {
      return Response.json({ 
        error: 'Missing required field: labData.price',
        field: 'price',
        message: 'Lab price is required'
      }, { status: 400 });
    }

    if (!auth) {
      return Response.json({ 
        error: 'Missing required field: labData.auth',
        field: 'auth',
        message: 'Authentication service URI is required'
      }, { status: 400 });
    }

    if (!accessURI) {
      return Response.json({ 
        error: 'Missing required field: labData.accessURI',
        field: 'accessURI',
        message: 'Lab access URI is required'
      }, { status: 400 });
    }

    if (!accessKey) {
      return Response.json({ 
        error: 'Missing required field: labData.accessKey',
        field: 'accessKey',
        message: 'Lab access key is required'
      }, { status: 400 });
    }

    // Authentication and authorization - only lab owner can update
    const session = await requireAuth();
    await requireLabOwner(session, numericLabId);

    // Convert price to BigInt for contract call
    let priceInContractUnits;
    try {
      priceInContractUnits = BigInt(price.toString());
    } catch (error) {
      return Response.json({
        error: 'Invalid price format',
        field: 'price',
        value: price,
        message: 'Price must be a valid number'
      }, { status: 400 });
    }

    devLog.log('🎯 Starting lab update process via SSO:', { 
      labId: numericLabId,
      uri, 
      price: priceInContractUnits.toString(),
      userAddress: session.address 
    });

    // Get contract instance
    const contractInstance = await getContractInstance();
    if (!contractInstance) {
      throw new Error('Failed to get contract instance');
    }

    devLog.log('🔗 Connected to blockchain, calling updateLab function...');

    // Call the updateLab function on the smart contract
    const transaction = await contractInstance.updateLab(
      numericLabId,
      uri,
      priceInContractUnits,
      auth,
      accessURI,
      accessKey
    );
    
    devLog.log('📤 Transaction sent, waiting for confirmation...', {
      hash: transaction.hash,
      labId: numericLabId
    });

    // Wait for transaction confirmation
    const receipt = await transaction.wait();
    
    const processingTime = Date.now() - startTime;
    devLog.log('✅ Lab updated successfully via SSO', {
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
      uri,
      price: priceInContractUnits.toString(),
      timestamp: new Date().toISOString(),
      processingTime
    }, { status: 200 });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    devLog.error('❌ Error updating lab via SSO:', error);

    // Handle guard errors (401, 403) separately from other errors
    if (error.name === 'UnauthorizedError' || error.name === 'ForbiddenError') {
      return handleGuardError(error);
    }

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

    // Handle "token owner" errors
    if (error.message?.includes('Token owner') || error.message?.includes('onlyTokenOwner')) {
      return Response.json({
        error: 'Authorization failed',
        message: 'Only the lab owner can update this lab.',
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
      message: 'An unexpected error occurred while updating the lab',
      type: 'INTERNAL_ERROR',
      processingTime
    }, { status: 500 });
  }
}
