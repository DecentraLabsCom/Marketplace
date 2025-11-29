/**
 * API Route: /api/contract/lab/addLabSSO
 * Creates a new lab using server wallet (for SSO users)
 * 
 * @description This endpoint creates a new lab in the marketplace using the server wallet.
 * It calls the `addLab` function on the smart contract, minting a new lab NFT.
 * Only available for authenticated SSO users as it uses the server wallet for gas fees.
 * 
 * @param {Request} request - HTTP request with lab creation details
 * @param {Object} request.body - Request body
 * @param {string} request.body.uri - Lab metadata URI (required)
 * @param {string|number} request.body.price - Lab price in contract units (required)
 * @param {string} request.body.auth - Authentication service URI (required)
 * @param {string} request.body.accessURI - Lab access URI (required)
 * @param {string} request.body.accessKey - Lab access key (required)
 * @returns {Response} JSON response with creation result, transaction hash, and new labId
 */

import { getContractInstance } from '../../utils/contractInstance'
import devLog from '@/utils/dev/logger'
import { requireAuth, handleGuardError } from '@/utils/auth/guards'

export async function POST(request) {
  const startTime = Date.now();
  
  try {
    // Parse and validate request body
    const body = await request.json();
    const { uri, price, auth, accessURI, accessKey } = body;
    
    // Input validation with detailed errors
    if (!uri) {
      return Response.json({ 
        error: 'Missing required field: uri',
        field: 'uri',
        message: 'Lab metadata URI is required'
      }, { status: 400 });
    }

    if (price === undefined || price === null) {
      return Response.json({ 
        error: 'Missing required field: price',
        field: 'price',
        message: 'Lab price is required'
      }, { status: 400 });
    }

    if (!auth) {
      return Response.json({ 
        error: 'Missing required field: auth',
        field: 'auth',
        message: 'Authentication service URI is required'
      }, { status: 400 });
    }

    if (!accessURI) {
      return Response.json({ 
        error: 'Missing required field: accessURI',
        field: 'accessURI',
        message: 'Lab access URI is required'
      }, { status: 400 });
    }

    if (!accessKey) {
      return Response.json({ 
        error: 'Missing required field: accessKey',
        field: 'accessKey',
        message: 'Lab access key is required'
      }, { status: 400 });
    }

    // Authentication - only authenticated users can create labs
    const session = await requireAuth();

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

    devLog.log('🎯 Starting lab creation process via SSO:', { 
      uri, 
      price: priceInContractUnits.toString(),
      userAddress: session.address 
    });

    // Get contract instance
    const contractInstance = await getContractInstance();
    if (!contractInstance) {
      throw new Error('Failed to get contract instance');
    }

    devLog.log('🔗 Connected to blockchain, calling addLab function...');

    // Call the addLab function on the smart contract
    const transaction = await contractInstance.addLab(
      uri,
      priceInContractUnits,
      auth,
      accessURI,
      accessKey
    );
    
    devLog.log('📤 Transaction sent, waiting for confirmation...', {
      hash: transaction.hash
    });

    // Wait for transaction confirmation
    const receipt = await transaction.wait();
    
    // Parse LabAdded event to get the new labId
    let newLabId = null;
    for (const log of receipt.logs) {
      try {
        const parsedLog = contractInstance.interface.parseLog({
          topics: log.topics,
          data: log.data
        });
        if (parsedLog && parsedLog.name === 'LabAdded') {
          newLabId = parsedLog.args._labId.toString();
          devLog.log('🔍 LabAdded event found:', { labId: newLabId });
          break;
        }
      } catch (e) {
        // Skip logs that can't be parsed
        continue;
      }
    }

    const processingTime = Date.now() - startTime;
    devLog.log('✅ Lab created successfully via SSO', {
      labId: newLabId,
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed?.toString(),
      processingTime: `${processingTime}ms`
    });

    // Return success response with transaction details
    return Response.json({
      success: true,
      labId: newLabId,
      id: newLabId,
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
    devLog.error('❌ Error creating lab via SSO:', error);

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

    // Handle "only LabProvider" errors
    if (error.message?.includes('LabProvider')) {
      return Response.json({
        error: 'Authorization failed',
        message: 'Only registered lab providers can create labs. Please register as a provider first.',
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
      message: 'An unexpected error occurred while creating the lab',
      type: 'INTERNAL_ERROR',
      processingTime
    }, { status: 500 });
  }
}
