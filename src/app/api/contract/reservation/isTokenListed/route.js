/**
 * Check if token is listed for reservation
/**
 * API Route: /api/contract/reservation/isTokenListed
 * Checks if a lab token must be listed in the marketplace
 * 
 * @description This endpoint queries the smart contract to check if a specific lab token
 * is currently listed and available for bookings in the marketplace.
 * 
 * @param {Request} request - HTTP request object
 * @param {Object} request.nextUrl.searchParams - URL search parameters
 * @param {string} request.nextUrl.searchParams.labId - Lab ID to check (required)
 * @returns {Response} JSON response with listing status or error details
 */

import { getContractInstance } from '../../utils/contractInstance'
import devLog from '@/utils/dev/logger'

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const noStoreHeaders = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET(request) {
  const startTime = Date.now();
  let numericLabId; // Declare outside try block for error handling access
  
  try {
    // Extract labId from URL search parameters
    const { searchParams } = new URL(request.url);
    const labId = searchParams.get('labId');
    
    // Input validation
    if (!labId && labId !== '0') {
      return Response.json({ 
        error: 'Missing required parameter: labId',
        parameter: 'labId',
        message: 'Lab ID is required to check listing status'
      }, { status: 400, headers: noStoreHeaders });
    }

    // Validate labId is a valid number
    numericLabId = Number(labId);
    if (isNaN(numericLabId) || numericLabId < 0) {
      return Response.json({ 
        error: 'Invalid lab ID format',
        parameter: 'labId',
        value: labId,
        message: 'Lab ID must be a valid non-negative number'
      }, { status: 400, headers: noStoreHeaders });
    }

    devLog.log('🔍 Checking lab listing status:', { labId: numericLabId });

    // Get contract instance
    const contractInstance = await getContractInstance();
    if (!contractInstance) {
      throw new Error('Failed to get contract instance');
    }

    // Call the isTokenListed function on the smart contract
    const isListed = await contractInstance.isTokenListed(numericLabId);
    
    const processingTime = Date.now() - startTime;
    devLog.log('✅ Lab listing status retrieved successfully', {
      labId: numericLabId,
      isListed,
      processingTime: `${processingTime}ms`
    });

    // Return the listing status
    return Response.json({
      labId: numericLabId,
      isListed,
      timestamp: new Date().toISOString(),
      processingTime
    }, { status: 200, headers: noStoreHeaders });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    devLog.error('❌ Error checking lab listing status:', error);

    // Handle specific contract errors
    if (error.message?.includes('execution reverted')) {
      const revertReason = error.message.match(/execution reverted: (.*)/)?.[1] || 'Unknown contract error';
      return Response.json({
        error: 'Contract query failed',
        message: revertReason,
        type: 'CONTRACT_ERROR',
        processingTime
      }, { status: 422, headers: noStoreHeaders }); // Unprocessable Entity for contract logic errors
    }

    // Handle network/connection errors
    if (error.message?.includes('network') || error.message?.includes('connection')) {
      return Response.json({
        error: 'Blockchain network error',
        message: 'Failed to connect to blockchain network. Please try again.',
        type: 'NETWORK_ERROR',
        processingTime
      }, { status: 503, headers: noStoreHeaders }); // Service Unavailable
    }

    // Handle token not found errors (common case)
    if (error.message?.includes('TokenNotFound') || error.message?.includes('nonexistent')) {
      return Response.json({
        error: 'Lab not found',
        message: `Lab with ID ${numericLabId} does not exist`,
        type: 'NOT_FOUND',
        processingTime
      }, { status: 404, headers: noStoreHeaders });
    }

    // Generic server error for unexpected issues
    return Response.json({
      error: 'Internal server error',
      message: 'An unexpected error occurred while checking lab listing status',
      type: 'INTERNAL_ERROR',
      processingTime
    }, { status: 500, headers: noStoreHeaders });
  }
}
