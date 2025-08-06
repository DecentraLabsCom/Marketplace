/**
 * Client-side booking contract services
 * Handles direct blockchain interactions using user's connected wallet
 * These services execute transactions from the frontend, not through API
 */
import { devLog } from '@/utils/dev/logger'

/**
 * Cancel a reservation request using user's wallet
 * @param {string} reservationKey - Reservation key to cancel
 * @param {Function} contractWriteFunction - Contract write function from useContractWriteFunction
 * @param {string} userAddress - User's wallet address
 * @returns {Promise<string>} Transaction hash
 */
export const cancelReservationRequest = async (reservationKey, contractWriteFunction, userAddress) => {
  if (!reservationKey) {
    throw new Error('Reservation key is required for cancellation');
  }

  if (!contractWriteFunction) {
    throw new Error('Contract write function is required');
  }

  if (!userAddress) {
    throw new Error('User address is required');
  }

  try {
    devLog.log('📋 [CLIENT] Cancelling reservation request with wallet:', {
      reservationKey,
      userAddress
    });

    // Call the contract function through the provided contractWriteFunction
    const txHash = await contractWriteFunction([reservationKey]);

    devLog.log('✅ [CLIENT] Reservation request cancellation transaction sent:', {
      txHash,
      reservationKey
    });

    return txHash;
    
  } catch (error) {
    devLog.error(`❌ [CLIENT] Reservation request cancellation failed:`, error);
    
    // Enhance error messages for common issues
    if (error.message?.includes('user rejected')) {
      throw new Error('Transaction cancelled');
    } else if (error.message?.includes('insufficient funds')) {
      throw new Error('Insufficient funds');
    } else if (error.message?.includes('Only the renter')) {
      throw new Error('Not authorized to cancel');
    } else if (error.message?.includes('Reservation not found')) {
      throw new Error('Reservation not found');
    } else {
      throw new Error(`Cancellation failed or cancelled`);
    }
  }
};

/**
 * Cancel a confirmed booking using user's wallet
 * @param {string} reservationKey - Reservation key to cancel
 * @param {Function} contractWriteFunction - Contract write function from useContractWriteFunction
 * @param {string} userAddress - User's wallet address
 * @returns {Promise<string>} Transaction hash
 */
export const cancelBooking = async (reservationKey, contractWriteFunction, userAddress) => {
  if (!reservationKey) {
    throw new Error('Reservation key is required for cancellation');
  }

  if (!contractWriteFunction) {
    throw new Error('Contract write function is required');
  }

  if (!userAddress) {
    throw new Error('User address is required');
  }

  try {
    devLog.log('📅 [CLIENT] Cancelling booking with wallet:', {
      reservationKey,
      userAddress
    });

    // Call the contract function through the provided contractWriteFunction
    const txHash = await contractWriteFunction([reservationKey]);

    devLog.log('✅ [CLIENT] Booking cancellation transaction sent:', {
      txHash,
      reservationKey
    });

    return txHash;
    
  } catch (error) {
    devLog.error(`❌ [CLIENT] Booking cancellation failed:`, error);
    
    // Enhance error messages for common issues
    if (error.message?.includes('user rejected')) {
      throw new Error('Transaction cancelled');
    } else if (error.message?.includes('insufficient funds')) {
      throw new Error('Insufficient funds');
    } else if (error.message?.includes('Only the renter')) {
      throw new Error('Not authorized to cancel');
    } else if (error.message?.includes('Reservation not found')) {
      throw new Error('Reservation not found');
    } else if (error.message?.includes('Too late to cancel')) {
      throw new Error('Too late to cancel');
    } else {
      throw new Error(`Cancel failed or cancelled`);
    }
  }
};

/**
 * Smart cancellation - uses booking status to determine correct cancellation method
 * @param {string} reservationKey - Reservation key to cancel
 * @param {Function} contractWriteFunctionRequest - Contract write function for cancelReservationRequest
 * @param {Function} contractWriteFunctionBooking - Contract write function for cancelBooking
 * @param {string} userAddress - User's wallet address
 * @param {string} [bookingStatus] - Status of the booking ('0'=pending, '1'=confirmed)
 * @returns {Promise<string>} Transaction hash
 */
export const cancelReservation = async (reservationKey, contractWriteFunctionRequest, contractWriteFunctionBooking, userAddress, bookingStatus) => {
  if (!reservationKey) {
    throw new Error('Reservation key is required for cancellation');
  }

  if (!contractWriteFunctionRequest || !contractWriteFunctionBooking) {
    throw new Error('Both contract write functions are required');
  }

  if (!userAddress) {
    throw new Error('User address is required');
  }

  try {
    devLog.log('🎯 [CLIENT] Smart cancellation based on status:', {
      reservationKey,
      bookingStatus,
      userAddress
    });

    // If we know the status, use the appropriate function directly
    if (bookingStatus === '0') {
      // Pending reservation - use cancelReservationRequest
      devLog.log('📋 [CLIENT] Cancelling pending reservation request...');
      return await cancelReservationRequest(reservationKey, contractWriteFunctionRequest, userAddress);
    } else if (bookingStatus === '1') {
      // Confirmed booking - use cancelBooking
      devLog.log('📅 [CLIENT] Cancelling confirmed booking...');
      return await cancelBooking(reservationKey, contractWriteFunctionBooking, userAddress);
    }

    // Fallback: Try reservation request cancellation first (lower gas for pending reservations)
    try {
      devLog.log('🔄 [CLIENT] Attempting reservation request cancellation first...');
      return await cancelReservationRequest(reservationKey, contractWriteFunctionRequest, userAddress);
    } catch (requestError) {
      devLog.log('⚠️ [CLIENT] Reservation request cancellation failed, trying booking cancellation...');
      
      // If reservation request fails, try booking cancellation
      return await cancelBooking(reservationKey, contractWriteFunctionBooking, userAddress);
    }
    
  } catch (error) {
    devLog.error(`❌ [CLIENT] Smart cancellation failed:`, error);
    throw error;
  }
};

/**
 * Create a reservation using user's wallet
 * @param {Object} bookingData - Reservation data
 * @param {string|number} bookingData.labId - Lab ID
 * @param {number} bookingData.startTime - Start timestamp
 * @param {number} bookingData.endTime - End timestamp
 * @param {Function} contractWriteFunction - Contract write function from useContractWriteFunction
 * @param {string} userAddress - User's wallet address
 * @returns {Promise<string>} Transaction hash
 */
export const createReservation = async (bookingData, contractWriteFunction, userAddress) => {
  if (!bookingData) {
    throw new Error('Booking data is required');
  }

  if (!contractWriteFunction) {
    throw new Error('Contract write function is required');
  }

  if (!userAddress) {
    throw new Error('User address is required');
  }

  const { labId, startTime, endTime } = bookingData;

  // Validate required booking data
  if (labId === undefined || labId === null) {
    throw new Error('Lab ID is required');
  }

  if (!startTime) {
    throw new Error('Start time is required');
  }

  if (!endTime) {
    throw new Error('End time is required');
  }

  // Validate time range
  if (endTime <= startTime) {
    throw new Error('End time must be after start time');
  }

  try {
    devLog.log('🚀 [CLIENT] Creating reservation with wallet:', {
      labId: labId.toString(),
      startTime,
      endTime,
      userAddress
    });

    // Call the contract function through the provided contractWriteFunction
    const txHash = await contractWriteFunction([
      labId,      // Lab ID
      startTime,  // Start timestamp
      endTime     // End timestamp
    ]);

    devLog.log('✅ [CLIENT] Reservation transaction sent:', {
      txHash,
      labId: labId.toString()
    });

    return txHash;
    
  } catch (error) {
    devLog.error(`❌ [CLIENT] Reservation creation failed:`, error);
    
    // Enhance error messages for common issues
    if (error.message?.includes('user rejected')) {
      throw new Error('Transaction cancelled');
    } else if (error.message?.includes('insufficient funds')) {
      throw new Error('Insufficient funds');
    } else if (error.message?.includes('Lab not available')) {
      throw new Error('Lab not available');
    } else if (error.message?.includes('Time slot not available')) {
      throw new Error('Time slot unavailable');
    } else {
      throw new Error(`Reservation failed or cancelled`);
    }
  }
};

/**
 * Claim all available balance using user's wallet
 * @param {Function} contractWriteFunction - Contract write function from useContractWriteFunction
 * @param {string} userAddress - User's wallet address
 * @returns {Promise<string>} Transaction hash
 */
export const claimAllBalance = async (contractWriteFunction, userAddress) => {
  if (!contractWriteFunction) {
    throw new Error('Contract write function is required');
  }

  if (!userAddress) {
    throw new Error('User address is required');
  }

  try {
    devLog.log('📤 [CLIENT] Claiming all balance with wallet:', { userAddress });

    // Call the contract function through the provided contractWriteFunction
    const txHash = await contractWriteFunction([]);

    devLog.log('✅ [CLIENT] Claim all balance transaction sent:', { txHash, userAddress });

    return txHash;
    
  } catch (error) {
    devLog.error(`❌ [CLIENT] Claim all balance failed:`, error);
    
    // Enhance error messages for common issues
    if (error.message?.includes('user rejected')) {
      throw new Error('Transaction cancelled');
    } else if (error.message?.includes('insufficient funds')) {
      throw new Error('Insufficient funds');
    } else if (error.message?.includes('No balance')) {
      throw new Error('No balance available');
    } else {
      throw new Error(`Claim failed or cancelled`);
    }
  }
};

/**
 * Claim balance for specific lab using user's wallet
 * @param {string|number} labId - Lab identifier
 * @param {Function} contractWriteFunction - Contract write function from useContractWriteFunction
 * @param {string} userAddress - User's wallet address
 * @returns {Promise<string>} Transaction hash
 */
export const claimLabBalance = async (labId, contractWriteFunction, userAddress) => {
  if (!labId && labId !== 0) {
    throw new Error('Lab ID is required for claiming lab balance');
  }

  if (!contractWriteFunction) {
    throw new Error('Contract write function is required');
  }

  if (!userAddress) {
    throw new Error('User address is required');
  }

  try {
    devLog.log('📤 [CLIENT] Claiming lab balance with wallet:', { labId, userAddress });

    // Call the contract function through the provided contractWriteFunction
    const txHash = await contractWriteFunction([labId]);

    devLog.log('✅ [CLIENT] Claim lab balance transaction sent:', { txHash, labId, userAddress });

    return txHash;
    
  } catch (error) {
    devLog.error(`❌ [CLIENT] Claim lab balance failed:`, error);
    
    // Enhance error messages for common issues
    if (error.message?.includes('user rejected')) {
      throw new Error('Transaction cancelled');
    } else if (error.message?.includes('insufficient funds')) {
      throw new Error('Insufficient funds');
    } else if (error.message?.includes('No balance')) {
      throw new Error('No balance available');
    } else if (error.message?.includes('Not authorized')) {
      throw new Error('Not authorized');
    } else {
      throw new Error(`Claim failed or cancelled`);
    }
  }
};

export const clientBookingServices = {
  cancelReservationRequest,
  cancelBooking,
  cancelReservation,
  createReservation,
  claimAllBalance,
  claimLabBalance
};
