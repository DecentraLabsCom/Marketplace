/**
 * API endpoint for canceling existing lab bookings
 * Handles POST requests to cancel confirmed reservations through smart contract
 * 
 * @description Optimized for React Query with proper validation and blockchain best practices
 * @version 2.0.0 - No server-side cache, React Query friendly with transaction support
 */

import { getContractInstance } from '../../utils/contractInstance'
import { executeBlockchainTransaction } from '@/app/api/contract/utils/retry'

/**
 * Cancels an existing booking reservation
 * @param {Request} request - HTTP request with cancellation details
 * @param {Object} request.body - Request body
 * @param {string} request.body.reservationKey - Unique reservation identifier (bytes32, required)
 * @param {boolean} [request.body.validateOnly=false] - If true, only validates without executing transaction
 * @returns {Response} JSON response with cancellation result, transaction hash, or error
 */
export async function POST(request) {
  const startTime = Date.now();
  
  try {
    // Parse and validate request body
    const body = await request.json();
    const { reservationKey, validateOnly = false } = body;
    
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

    console.log(`Processing cancellation request - reservationKey: ${reservationKeyStr}, validateOnly: ${validateOnly}`);

    // If only validation requested, return early
    if (validateOnly) {
      return Response.json({
        success: true,
        data: {
          reservationKey: reservationKeyStr,
          validated: true
        },
        meta: {
          timestamp: new Date().toISOString(),
          validationOnly: true
        }
      }, { 
        status: 200,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Content-Type': 'application/json'
        }
      });
    }

    // Get contract instance with error handling
    let contract;
    try {
      contract = await getContractInstance();
    } catch (contractError) {
      console.error('Failed to get contract instance:', contractError);
      return Response.json({ 
        error: 'Blockchain connection failed',
        code: 'CONTRACT_ERROR',
        retryable: true
      }, { status: 503 });
    }

    // Execute blockchain transaction WITHOUT retry (prevents duplicates)
    let transactionHash;
    let receipt;
    
    try {
      const tx = await executeBlockchainTransaction(() => 
        contract.cancelBooking(reservationKeyStr)
      );
      
      transactionHash = tx.hash;
      console.log('Cancellation transaction submitted:', transactionHash);
      
      // Wait for confirmation
      receipt = await tx.wait();
      console.log('Cancellation confirmed:', receipt.transactionHash);
      
    } catch (blockchainError) {
      console.error('Blockchain cancellation failed:', blockchainError);
      
      // Parse blockchain error for better client handling
      let errorCode = 'BLOCKCHAIN_ERROR';
      let retryable = true;
      let errorMessage = 'Cancellation transaction failed';
      let httpStatus = 500;
      
      if (blockchainError.message?.includes('user rejected')) {
        errorCode = 'USER_REJECTED';
        errorMessage = 'Transaction was rejected by user';
        retryable = false;
        httpStatus = 400;
      } else if (blockchainError.message?.includes('insufficient funds')) {
        errorCode = 'INSUFFICIENT_FUNDS';
        errorMessage = 'Insufficient funds for gas fees';
        retryable = false;
        httpStatus = 400;
      } else if (blockchainError.message?.includes('Only the renter') || blockchainError.reason?.includes('Only the renter')) {
        errorCode = 'NOT_AUTHORIZED';
        errorMessage = 'Only the person who made the reservation can cancel it';
        retryable = false;
        httpStatus = 403;
      } else if (blockchainError.message?.includes('Invalid') || blockchainError.reason?.includes('Invalid')) {
        errorCode = 'INVALID_STATE';
        errorMessage = 'Cannot cancel booking in current state. Reservation may be pending or already processed.';
        retryable = false;
        httpStatus = 400;
      } else if (blockchainError.message?.includes('reservation not found')) {
        errorCode = 'RESERVATION_NOT_FOUND';
        errorMessage = 'Reservation not found';
        retryable = false;
        httpStatus = 404;
      } else if (blockchainError.message?.includes('not authorized')) {
        errorCode = 'NOT_AUTHORIZED';
        errorMessage = 'Not authorized to cancel this reservation';
        retryable = false;
        httpStatus = 403;
      } else if (blockchainError.message?.includes('nonce')) {
        errorCode = 'NONCE_ERROR';
        errorMessage = 'Transaction nonce error, please try again';
        retryable = true;
        httpStatus = 500;
      }
      
      return Response.json({ 
        error: errorMessage,
        code: errorCode,
        retryable,
        details: process.env.NODE_ENV === 'development' ? blockchainError.message : undefined,
        reservationKey: reservationKeyStr
      }, { status: httpStatus });
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Return success response optimized for React Query
    return Response.json({
      success: true,
      data: {
        transactionHash,
        blockHash: receipt.blockHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed?.toString(),
        reservationKey: reservationKeyStr,
        cancelled: true
      },
      meta: {
        timestamp: new Date().toISOString(),
        duration,
        confirmed: true
      }
    }, { 
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Unexpected error in cancelBooking:', error);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    return Response.json({ 
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      retryable: true,
      meta: {
        timestamp: new Date().toISOString(),
        duration
      }
    }, { 
      status: 500,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': 'application/json'
      }
    });
  }
}
