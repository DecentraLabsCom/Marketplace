/**
 * Unified Booking Services - Authentication-Aware Router
 * Routes to appropriate service layer based on user authentication type:
 * - SSO users → serverBookingServices (API endpoints → server wallet)
 * - Wallet users → clientBookingServices (direct contract calls → user wallet)
 */

import { serverBookingServices } from './serverBookingServices'
import { clientBookingServices } from './clientBookingServices'
import { devLog } from '@/utils/dev/logger'

/**
 * Create a booking with authentication-aware routing
 * @param {Object} bookingData - Booking data
 * @param {Object} authContext - Authentication context
 * @param {boolean} authContext.isSSO - Whether user is SSO authenticated
 * @param {Function} [authContext.contractWriteFunction] - Contract write function (wallet users)
 * @param {string} [authContext.userAddress] - User wallet address (wallet users)
 * @returns {Promise<string|Object>} Transaction hash (wallet) or result object (SSO)
 */
export const createBooking = async (bookingData, authContext) => {
  const { isSSO, contractWriteFunction, userAddress } = authContext;

  devLog.log('🔀 [ROUTER] Creating booking via', isSSO ? 'server (SSO)' : 'client (wallet)');

  if (isSSO) {
    // SSO users → Server-side transaction via API
    return await serverBookingServices.createBooking(bookingData);
  } else {
    // Wallet users → Client-side transaction via user's wallet
    if (!contractWriteFunction || !userAddress) {
      throw new Error('Contract write function and user address required for wallet users');
    }

    // Convert bookingData format for client service
    const clientBookingData = {
      labId: bookingData.labId,
      startTime: bookingData.start,
      endTime: bookingData.start + bookingData.timeslot
    };

    return await clientBookingServices.createReservation(
      clientBookingData,
      contractWriteFunction,
      userAddress
    );
  }
};

/**
 * Cancel a booking with authentication-aware routing
 * @param {string} reservationKey - Reservation key to cancel
 * @param {Object} authContext - Authentication context
 * @param {boolean} authContext.isSSO - Whether user is SSO authenticated
 * @param {Function} [authContext.cancelReservationRequestFn] - Cancel reservation request function (wallet users)
 * @param {Function} [authContext.cancelBookingFn] - Cancel booking function (wallet users)
 * @param {string} [authContext.userAddress] - User wallet address (wallet users)
 * @returns {Promise<string|Object>} Transaction hash (wallet) or result object (SSO)
 */
export const cancelBooking = async (reservationKey, authContext) => {
  const { isSSO, cancelReservationRequestFn, cancelBookingFn, userAddress } = authContext;

  devLog.log('🔀 [ROUTER] Cancelling booking via', isSSO ? 'server (SSO)' : 'client (wallet)');

  if (isSSO) {
    // SSO users → Server-side transaction via API
    return await serverBookingServices.cancelBooking(reservationKey);
  } else {
    // Wallet users → Client-side transaction via user's wallet
    if (!cancelReservationRequestFn || !cancelBookingFn || !userAddress) {
      throw new Error('Contract write functions and user address required for wallet users');
    }

    return await clientBookingServices.cancelReservation(
      reservationKey,
      cancelReservationRequestFn,
      cancelBookingFn,
      userAddress
    );
  }
};

/**
 * Claim all available balance with authentication-aware routing
 * @param {Object} authContext - Authentication context
 * @param {boolean} authContext.isSSO - Whether user is SSO authenticated
 * @param {Function} [authContext.contractWriteFunction] - Contract write function (wallet users)
 * @param {string} [authContext.userAddress] - User wallet address (wallet users)
 * @returns {Promise<string|Object>} Transaction hash (wallet) or result object (SSO)
 */
export const claimAllBalance = async (authContext) => {
  const { isSSO, contractWriteFunction, userAddress } = authContext;

  devLog.log('🔀 [ROUTER] Claiming all balance via', isSSO ? 'server (SSO)' : 'client (wallet)');

  if (isSSO) {
    // SSO users → Server-side transaction via API
    return await serverBookingServices.claimAllBalance();
  } else {
    // Wallet users → Client-side transaction via user's wallet
    if (!contractWriteFunction || !userAddress) {
      throw new Error('Contract write function and user address required for wallet users');
    }

    return await clientBookingServices.claimAllBalance(contractWriteFunction, userAddress);
  }
};

/**
 * Claim balance for specific lab with authentication-aware routing
 * @param {string|number} labId - Lab identifier
 * @param {Object} authContext - Authentication context
 * @param {boolean} authContext.isSSO - Whether user is SSO authenticated
 * @param {Function} [authContext.contractWriteFunction] - Contract write function (wallet users)
 * @param {string} [authContext.userAddress] - User wallet address (wallet users)
 * @returns {Promise<string|Object>} Transaction hash (wallet) or result object (SSO)
 */
export const claimLabBalance = async (labId, authContext) => {
  const { isSSO, contractWriteFunction, userAddress } = authContext;

  devLog.log('🔀 [ROUTER] Claiming lab balance via', isSSO ? 'server (SSO)' : 'client (wallet)', 'for lab:', labId);

  if (isSSO) {
    // SSO users → Server-side transaction via API
    return await serverBookingServices.claimLabBalance(labId);
  } else {
    // Wallet users → Client-side transaction via user's wallet
    if (!contractWriteFunction || !userAddress) {
      throw new Error('Contract write function and user address required for wallet users');
    }

    return await clientBookingServices.claimLabBalance(labId, contractWriteFunction, userAddress);
  }
};

// Re-export all read operations from server services (same for both auth types)
export const {
  fetchReservationCount,
  fetchReservationKeyByIndex,
  fetchReservationDetails,
  fetchUserBookingsComposed,
  fetchLabBookingsComposed,
  fetchAllBookingsComposed
} = serverBookingServices;

export const bookingServices = {
  createBooking,
  cancelBooking,
  claimAllBalance,
  claimLabBalance,
  fetchReservationCount,
  fetchReservationKeyByIndex,
  fetchReservationDetails,
  fetchUserBookingsComposed,
  fetchLabBookingsComposed,
  fetchAllBookingsComposed
};
