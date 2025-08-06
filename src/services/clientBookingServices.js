/**
 * Client-side booking contract services
 * Handles direct blockchain interactions using user's connected wallet
 * These services execute transactions from the frontend, not through API
 */
import { ethers } from 'ethers'
import { contractABI, contractAddresses } from '@/contracts/diamond'
import { defaultChain } from '@/utils/blockchain/networkConfig'
import { devLog } from '@/utils/dev/logger'

/**
 * Get contract instance with user's connected wallet
 * @param {Object} walletClient - Wagmi wallet client from useWalletClient
 * @param {string} userAddress - User's wallet address for validation
 * @returns {Promise<ethers.Contract>} Contract instance with user's signer
 */
export const getClientContractInstance = async (walletClient, userAddress) => {
  if (!walletClient) {
    throw new Error('Wallet client is required for contract interaction');
  }

  if (!userAddress) {
    throw new Error('User address is required for contract interaction');
  }

  // Verify wallet client address matches expected user
  if (walletClient.account?.address?.toLowerCase() !== userAddress.toLowerCase()) {
    throw new Error(`Wallet address mismatch: expected ${userAddress}, got ${walletClient.account?.address}`);
  }

  // Create ethers provider from wallet client
  const provider = new ethers.BrowserProvider(walletClient);
  const signer = await provider.getSigner();

  // Get contract address for current chain
  const chainKey = defaultChain.name.toLowerCase();
  const contractAddress = contractAddresses[chainKey];
  
  if (!contractAddress) {
    throw new Error(`No contract address defined for network "${chainKey}"`);
  }

  return new ethers.Contract(contractAddress, contractABI, signer);
};

/**
 * Cancel a reservation request using user's wallet
 * @param {string} reservationKey - Reservation key to cancel
 * @param {Object} walletClient - Wagmi wallet client from useWalletClient
 * @param {string} userAddress - User's wallet address
 * @returns {Promise<Object>} Transaction result
 */
export const cancelReservationRequest = async (reservationKey, walletClient, userAddress) => {
  if (!reservationKey) {
    throw new Error('Reservation key is required for cancellation');
  }

  devLog.log(`🔄 [CLIENT] Cancelling reservation request ${reservationKey} with user wallet ${userAddress}`);

  try {
    // Get contract instance with user's signer
    const contract = await getClientContractInstance(walletClient, userAddress);
    
    // Debug: Verify the setup before transaction
    const signerAddress = await contract.runner.getAddress();
    devLog.log(`🔍 [CLIENT] Using signer address: ${signerAddress}`);
    
    // Get reservation details for validation
    const reservation = await contract.getReservation(reservationKey);
    devLog.log(`🔍 [CLIENT] Reservation renter: ${reservation.renter}`);
    devLog.log(`🔍 [CLIENT] Addresses match: ${signerAddress.toLowerCase() === reservation.renter.toLowerCase()}`);
    
    // Execute the transaction
    devLog.log(`📤 [CLIENT] Sending cancelReservationRequest transaction...`);
    const tx = await contract.cancelReservationRequest(reservationKey);
    
    devLog.log(`⏳ [CLIENT] Transaction sent: ${tx.hash}. Waiting for confirmation...`);
    
    // Wait for transaction confirmation
    const receipt = await tx.wait();
    
    devLog.log(`✅ [CLIENT] Reservation request cancelled successfully! Block: ${receipt.blockNumber}`);
    
    return {
      success: true,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed?.toString(),
      reservationKey,
      cancelled: true
    };
    
  } catch (error) {
    devLog.error(`❌ [CLIENT] Failed to cancel reservation request:`, error);
    
    // Parse specific errors
    let userMessage = 'Failed to cancel reservation';
    
    if (error.message?.includes('Only the renter') || error.reason?.includes('Only the renter')) {
      userMessage = 'Only the person who made the reservation can cancel it';
    } else if (error.message?.includes('user rejected')) {
      userMessage = 'Transaction was cancelled by user';
    } else if (error.message?.includes('insufficient funds')) {
      userMessage = 'Insufficient funds for gas fees';
    } else if (error.message?.includes('network')) {
      userMessage = 'Network error. Please try again.';
    }
    
    const customError = new Error(userMessage);
    customError.originalError = error;
    customError.code = error.code;
    throw customError;
  }
};

/**
 * Cancel a confirmed booking using user's wallet
 * @param {string} reservationKey - Reservation key to cancel
 * @param {Object} walletClient - Wagmi wallet client from useWalletClient
 * @param {string} userAddress - User's wallet address
 * @returns {Promise<Object>} Transaction result
 */
export const cancelBooking = async (reservationKey, walletClient, userAddress) => {
  if (!reservationKey) {
    throw new Error('Reservation key is required for cancellation');
  }

  devLog.log(`🔄 [CLIENT] Cancelling booking ${reservationKey} with user wallet ${userAddress}`);

  try {
    // Get contract instance with user's signer
    const contract = await getClientContractInstance(walletClient, userAddress);
    
    // Debug: Verify the setup before transaction
    const signerAddress = await contract.runner.getAddress();
    devLog.log(`🔍 [CLIENT] Using signer address: ${signerAddress}`);
    
    // Get reservation details for validation
    const reservation = await contract.getReservation(reservationKey);
    devLog.log(`🔍 [CLIENT] Reservation renter: ${reservation.renter}`);
    devLog.log(`🔍 [CLIENT] Addresses match: ${signerAddress.toLowerCase() === reservation.renter.toLowerCase()}`);
    
    // Execute the transaction
    devLog.log(`📤 [CLIENT] Sending cancelBooking transaction...`);
    const tx = await contract.cancelBooking(reservationKey);
    
    devLog.log(`⏳ [CLIENT] Transaction sent: ${tx.hash}. Waiting for confirmation...`);
    
    // Wait for transaction confirmation
    const receipt = await tx.wait();
    
    devLog.log(`✅ [CLIENT] Booking cancelled successfully! Block: ${receipt.blockNumber}`);
    
    return {
      success: true,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed?.toString(),
      reservationKey,
      cancelled: true
    };
    
  } catch (error) {
    devLog.error(`❌ [CLIENT] Failed to cancel booking:`, error);
    
    // Parse specific errors
    let userMessage = 'Failed to cancel booking';
    
    if (error.message?.includes('Only the renter') || error.reason?.includes('Only the renter')) {
      userMessage = 'Only the person who made the reservation can cancel it';
    } else if (error.message?.includes('Invalid') || error.reason?.includes('Invalid')) {
      userMessage = 'Cannot cancel booking in current state. Reservation may be pending or already processed.';
    } else if (error.message?.includes('user rejected')) {
      userMessage = 'Transaction was cancelled by user';
    } else if (error.message?.includes('insufficient funds')) {
      userMessage = 'Insufficient funds for gas fees';
    } else if (error.message?.includes('network')) {
      userMessage = 'Network error. Please try again.';
    }
    
    const customError = new Error(userMessage);
    customError.originalError = error;
    customError.code = error.code;
    throw customError;
  }
};

/**
 * Smart cancellation that detects reservation status and uses appropriate method
 * @param {string} reservationKey - Reservation key to cancel
 * @param {Object} walletClient - Wagmi wallet client from useWalletClient
 * @param {string} userAddress - User's wallet address
 * @returns {Promise<Object>} Transaction result
 */
export const cancelReservation = async (reservationKey, walletClient, userAddress) => {
  if (!reservationKey) {
    throw new Error('Reservation key is required for cancellation');
  }

  devLog.log(`🔄 [CLIENT] Smart cancellation for ${reservationKey} with wallet ${userAddress}`);

  try {
    // Get contract instance to check reservation status
    const contract = await getClientContractInstance(walletClient, userAddress);
    
    // Get reservation details
    const reservation = await contract.getReservation(reservationKey);
    const status = Number(reservation.status);
    
    devLog.log(`🔍 [CLIENT] Reservation status: ${status} (0=pending, 1=confirmed)`);
    
    // Use appropriate cancellation method based on status
    if (status === 0) {
      devLog.log(`📋 [CLIENT] Reservation is pending, using cancelReservationRequest`);
      return await cancelReservationRequest(reservationKey, walletClient, userAddress);
    } else {
      devLog.log(`📋 [CLIENT] Reservation is confirmed, using cancelBooking`);
      return await cancelBooking(reservationKey, walletClient, userAddress);
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
      throw new Error('Transaction was cancelled by user');
    } else if (error.message?.includes('insufficient funds')) {
      throw new Error('Insufficient funds for gas fees');
    } else if (error.message?.includes('Lab not available')) {
      throw new Error('Lab is not available for the selected time');
    } else if (error.message?.includes('Time slot not available')) {
      throw new Error('Time slot is already booked');
    } else {
      throw new Error(`Failed to create reservation: ${error.message}`);
    }
  }
};

export const clientBookingServices = {
  cancelReservationRequest,
  cancelBooking,
  cancelReservation,
  createReservation,
  getClientContractInstance
};
