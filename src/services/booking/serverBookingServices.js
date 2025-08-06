/**
 * Server Booking Services - Atomic and Composed
 * Handles API calls to server endpoints (server wallet transactions)
 * Used for SSO authenticated users
 * Follows dual-layer pattern: atomic services (1:1 with endpoints) + composed services (orchestrate multiple calls)
 */

import { devLog } from '@/utils/dev/logger'

// ===========================
// ATOMIC SERVICES (1:1 with API endpoints)
// ===========================

/**
 * Get reservation count for user (atomic service)
 * @param {string} userAddress - User wallet address
 * @returns {Promise<number>} Number of reservations
 */
export const fetchReservationCount = async (userAddress) => {
  if (!userAddress) {
    throw new Error('User address is required for fetching reservation count');
  }

  const params = new URLSearchParams({ userAddress });

  const response = await fetch(`/api/contract/reservation/reservationsOf?${params}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.count || 0;
};

/**
 * Get reservation key by user index (atomic service)
 * @param {string} userAddress - User wallet address
 * @param {number} index - Index of the reservation
 * @returns {Promise<string>} Reservation key
 */
export const fetchReservationKeyByIndex = async (userAddress, index) => {
  if (!userAddress) {
    throw new Error('User address is required');
  }

  const params = new URLSearchParams({ userAddress, index: index.toString() });

  const response = await fetch(`/api/contract/reservation/reservationKeyOfUserByIndex?${params}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.reservationKey;
};

/**
 * Get all user reservation keys (composed atomic calls)
 * @param {string} userAddress - User wallet address
 * @returns {Promise<Array<string>>} Array of reservation keys
 */
export const fetchUserReservationKeys = async (userAddress) => {
  if (!userAddress) {
    throw new Error('User address is required for fetching reservation keys');
  }

  const params = new URLSearchParams({ userAddress });

  const response = await fetch(`/api/contract/reservation/getUserBookings?${params}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.reservationKeys || [];
};

/**
 * Fetch user bookings from API (atomic service)
 * Uses efficient reservationsOf + reservationKeyOfUserByIndex pattern
 * @param {string} userAddress - User wallet address
 * @param {boolean} clearCache - Whether to bypass cache
 * @returns {Promise<Array>} Array of user bookings
 */
export const fetchUserBookings = async (userAddress, clearCache = false) => {
  if (!userAddress) {
    throw new Error('User address is required for fetching bookings');
  }

  // Get reservation keys first
  const reservationKeys = await fetchUserReservationKeys(userAddress);
  
  if (reservationKeys.length === 0) {
    return [];
  }

  // Get details for each reservation key
  const bookingPromises = reservationKeys.map(async (key, index) => {
    try {
      const reservationResponse = await fetchReservationDetails(key);
      
      if (!reservationResponse || !reservationResponse.reservation) {
        devLog.warn(`⚠️ No reservation data returned for key: ${key}`);
        return null;
      }
      
      // Extract the actual reservation data from the response
      const reservationData = reservationResponse.reservation;
      
      // Extract fields from the reservation struct with safe fallbacks
      const labId = reservationData.labId;
      const renter = reservationData.renter; 
      const price = reservationData.price;
      const start = reservationData.start;
      const end = reservationData.end;
      const status = reservationData.status;
      
      // Validate required fields
      if (labId === undefined || labId === null) {
        devLog.warn(`⚠️ Missing labId for reservation key: ${key}`, reservationData);
        return null;
      }
      
      if (start === undefined || start === null) {
        devLog.warn(`⚠️ Missing start time for reservation key: ${key}`);
        return null;
      }
      
      if (end === undefined || end === null) {
        devLog.warn(`⚠️ Missing end time for reservation key: ${key}`);
        return null;
      }
      
      // Convert to numbers safely
      const startNum = Number(start);
      const endNum = Number(end);
      const statusNum = Number(status || 0);
      
      // Validate converted numbers
      if (isNaN(startNum) || isNaN(endNum)) {
        devLog.warn(`⚠️ Invalid timestamps for reservation key: ${key}`, { start, end });
        return null;
      }
      
      const now = Date.now() / 1000; // Current time in seconds
      
      return {
        id: index,
        reservationKey: key,
        labId: labId.toString(),
        start: startNum.toString(), // Unix timestamp in seconds
        end: endNum.toString(), // Unix timestamp in seconds  
        status: statusNum.toString(),
        price: (price?.toString() || '0'),
        renter: (renter?.toString() || userAddress),
        date: new Date(startNum * 1000).toISOString().split('T')[0], // Add date field in YYYY-MM-DD format
        startDate: new Date(startNum * 1000),
        endDate: new Date(endNum * 1000),
        duration: endNum - startNum, // Duration in seconds
        isActive: now >= startNum && now < endNum,
        // Add additional fields from the API response
        reservationState: reservationData.reservationState,
        isPending: reservationData.isPending,
        isBooked: reservationData.isBooked,
        isUsed: reservationData.isUsed,
        isCollected: reservationData.isCollected,
        isCanceled: reservationData.isCanceled,
        isCompleted: reservationData.isCompleted,
        isConfirmed: reservationData.isConfirmed
      };
    } catch (error) {
      devLog.error(`❌ Error processing reservation key ${key}:`, error);
      return null;
    }
  });

  const allBookings = await Promise.all(bookingPromises);
  const validBookings = allBookings.filter(booking => booking !== null);
  
  devLog.log(`🔧 [SERVICE] ✅ Successfully processed ${validBookings.length}/${allBookings.length} bookings`);
  return validBookings;
};

/**
 * Fetch lab bookings from API (atomic service) 
 * Uses efficient getReservationsOfToken + getReservationOfTokenByIndex pattern
 * @param {string|number} labId - Lab ID
 * @param {boolean} clearCache - Whether to bypass cache
 * @returns {Promise<Array>} Array of lab bookings
 */
export const fetchLabBookings = async (labId, clearCache = false) => {
  if (!labId) {
    throw new Error('Lab ID is required for fetching bookings');
  }

  const params = new URLSearchParams({ 
    labId: labId.toString(),
    ...(clearCache && { t: Date.now().toString() })
  });

  const response = await fetch(`/api/contract/reservation/getLabBookings?${params}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.bookings || data || [];
};

/**
 * Fetch single reservation details (atomic service)
 * @param {string} reservationKey - Reservation key
 * @returns {Promise<Object>} Reservation details
 */
export const fetchReservationDetails = async (reservationKey) => {
  if (!reservationKey) {
    throw new Error('Reservation key is required');
  }

  const params = new URLSearchParams({ reservationKey });

  const response = await fetch(`/api/contract/reservation/getReservation?${params}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
};

/**
 * Create a new booking (atomic service)
 * @param {Object} bookingData - Booking data
 * @param {string|number} bookingData.labId - Lab ID
 * @param {string} bookingData.userAddress - User wallet address (for context, not sent to API)
 * @param {number} bookingData.start - Start time (Unix timestamp)
 * @param {number} bookingData.timeslot - Duration in seconds
 * @returns {Promise<Object>} Created booking details
 */
export const createBooking = async (bookingData) => {
  const { labId, start, timeslot } = bookingData;
  
  if (!labId && labId !== 0) {
    throw new Error('Lab ID is required');
  }
  if (!start) {
    throw new Error('Start time is required');
  }
  if (!timeslot) {
    throw new Error('Timeslot duration is required');
  }

  const response = await fetch('/api/contract/reservation/makeBookingSSO', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ labId, start, timeslot })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  const result = await response.json();
  // The endpoint returns { success: true, data: {...}, meta: {...} }
  // Return only the relevant data for the service consumer
  return result.data || result;
};

/**
 * Cancel a booking (atomic service)
 * @param {string} reservationKey - Reservation key to cancel
 * @returns {Promise<Object>} Cancellation result
 */
export const cancelBooking = async (reservationKey) => {
  if (!reservationKey) {
    throw new Error('Reservation key is required for cancellation');
  }

  try {
    const response = await fetch('/api/contract/reservation/cancelBookingSSO', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reservationKey })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      // Create concise error messages based on the error code
      let userMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
      
      if (errorData.code === 'NOT_AUTHORIZED') {
        userMessage = 'Not authorized to cancel';
      } else if (errorData.code === 'INVALID_STATE') {
        userMessage = 'Cannot cancel in current state';
      } else if (errorData.code === 'RESERVATION_NOT_FOUND') {
        userMessage = 'Reservation not found';
      } else if (errorData.code === 'INSUFFICIENT_FUNDS') {
        userMessage = 'Insufficient funds';
      } else if (errorData.code === 'USER_REJECTED') {
        userMessage = 'Transaction cancelled';
      }
      
      const error = new Error(userMessage);
      error.code = errorData.code;
      error.retryable = errorData.retryable;
      throw error;
    }

    const result = await response.json();
    // The endpoint returns { success: true, data: {...}, meta: {...} }
    // Return only the relevant data for the service consumer
    return result.data || result;
  } catch (error) {
    // If it's already our custom error, just re-throw it
    if (error.code) {
      throw error;
    }
    
    // Otherwise wrap it in a generic error
    throw new Error(`Cancellation failed or cancelled`);
  }
};

/**
 * Cancel a reservation request (atomic service)
 * @param {string} reservationKey - Reservation key to cancel
 * @returns {Promise<Object>} Cancellation result
 */
export const cancelReservationRequest = async (reservationKey) => {
  if (!reservationKey) {
    throw new Error('Reservation key is required for cancellation');
  }

  try {
    const response = await fetch('/api/contract/reservation/cancelRequestSSO', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reservationKey })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      // Create concise error messages based on the error code
      let userMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
      
      if (errorData.code === 'NOT_AUTHORIZED') {
        userMessage = 'Not authorized to cancel';
      } else if (errorData.code === 'RESERVATION_NOT_FOUND') {
        userMessage = 'Reservation not found';
      } else if (errorData.code === 'INSUFFICIENT_FUNDS') {
        userMessage = 'Insufficient funds';
      } else if (errorData.code === 'USER_REJECTED') {
        userMessage = 'Transaction cancelled';
      }
      
      const error = new Error(userMessage);
      error.code = errorData.code;
      error.retryable = errorData.retryable;
      throw error;
    }

    const result = await response.json();
    // The endpoint returns { success: true, data: {...}, meta: {...} }
    // Return only the relevant data for the service consumer
    return result.data || result;
  } catch (error) {
    // If it's already our custom error, just re-throw it
    if (error.code) {
      throw error;
    }
    
    // Otherwise wrap it in a generic error
    throw new Error(`Cancellation failed or cancelled`);
  }
};

/**
 * Cancel a reservation (composed service)
 * Automatically detects reservation status and calls the appropriate cancellation method
 * @param {string} reservationKey - Reservation key to cancel
 * @param {string} [bookingStatus] - Status of the booking ('0'=pending, '1'=confirmed) - optimizes by skipping status detection
 * @returns {Promise<Object>} Cancellation result
 */
export const cancelReservation = async (reservationKey, bookingStatus) => {
  if (!reservationKey) {
    throw new Error('Reservation key is required for cancellation');
  }

  try {
    // If we already know the status, use it directly (optimization)
    if (bookingStatus !== undefined && bookingStatus !== null) {
      const status = Number(bookingStatus);
      devLog.log('🎯 [SERVICE] Using provided booking status:', status);

      if (status === 0) {
        devLog.log('📋 [SERVICE] Reservation is pending (provided status), using cancelReservationRequest');
        try {
          return await cancelReservationRequest(reservationKey);
        } catch (cancelRequestError) {
          devLog.error('📋 [SERVICE] cancelReservationRequest failed for pending reservation:', cancelRequestError);
          throw cancelRequestError; // Propagate the specific error
        }
      } else {
        devLog.log('📅 [SERVICE] Reservation is confirmed (provided status), using cancelBooking');
        try {
          return await cancelBooking(reservationKey);
        } catch (cancelBookingError) {
          devLog.error('📋 [SERVICE] cancelBooking failed for confirmed reservation:', cancelBookingError);
          throw cancelBookingError; // Propagate the specific error
        }
      }
    }

    // If no status provided, fetch it from API (original behavior)
    devLog.log('🔄 [SERVICE] No status provided, fetching from API...');
    
    // First, get the reservation status to determine which cancellation method to use
    const response = await fetch(`/api/contract/reservation/getReservation?reservationKey=${reservationKey}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error('Failed to get reservation status');
    }

    const reservationData = await response.json();
    devLog.log('📋 [SERVICE] Reservation data from API:', reservationData);
    
    const status = Number(reservationData.reservation?.status ?? 1); // Default to confirmed if unknown
    devLog.log('📋 [SERVICE] Detected reservation status:', status);

    // Status: 0 = pending (use cancelReservationRequest), 1 = confirmed (use cancelBooking)
    if (status === 0) {
      devLog.log('📋 [SERVICE] Reservation is pending, using cancelReservationRequest');
      try {
        return await cancelReservationRequest(reservationKey);
      } catch (cancelRequestError) {
        devLog.error('📋 [SERVICE] cancelReservationRequest failed for pending reservation:', cancelRequestError);
        throw cancelRequestError; // Propagate the specific error
      }
    } else {
      devLog.log('📋 [SERVICE] Reservation is confirmed or unknown status, using cancelBooking');
      try {
        return await cancelBooking(reservationKey);
      } catch (cancelBookingError) {
        devLog.error('📋 [SERVICE] cancelBooking failed for confirmed reservation:', cancelBookingError);
        throw cancelBookingError; // Propagate the specific error
      }
    }
  } catch (statusError) {
    // Only fallback to cancelBooking if we truly can't determine the status
    // This should be rare and only for network/API issues
    if (statusError.message?.includes('Failed to get reservation status')) {
      devLog.warn('Could not determine reservation status due to API error, trying cancelBooking as fallback:', statusError);
      try {
        return await cancelBooking(reservationKey);
      } catch (fallbackError) {
        // If both status check and fallback fail, throw the original status error
        devLog.error('📋 [SERVICE] Both status check and cancelBooking fallback failed');
        throw new Error(`Unable to cancel reservation: ${statusError.message}. Fallback also failed: ${fallbackError.message}`);
      }
    } else {
      // If it's any other error (like authorization errors), just re-throw it
      throw statusError;
    }
  }
};

// ===========================
// COMPOSED SERVICES (orchestrate multiple atomic calls)
// ===========================

/**
 * Fetch comprehensive user booking data (composed service)
 * Orchestrates user bookings with additional context
 * Tolerant to partial failures - returns available data with fallbacks
 * @param {string} userAddress - User wallet address
 * @param {boolean} includeDetails - Whether to fetch detailed reservation info
 * @returns {Promise<Object>} Comprehensive user booking data
 */
export const fetchUserBookingsComposed = async (userAddress, includeDetails = false) => {
  if (!userAddress) {
    throw new Error('User address is required for composed booking fetch');
  }

  devLog.log('🔧 [SERVICE] 📊 Fetching composed user bookings for:', userAddress);

  try {
    // Step 1: Get reservation keys (fundamental step)
    let reservationKeys = [];
    try {
      reservationKeys = await fetchUserReservationKeys(userAddress);
      devLog.log(`🔧 [SERVICE] ✅ Fetched ${reservationKeys.length} reservation keys`);
    } catch (error) {
      devLog.error('❌ Failed to fetch reservation keys:', error);
      // Return empty result if we can't even get the keys
      return {
        userAddress,
        bookings: [],
        totalBookings: 0,
        activeBookings: 0,
        pastBookings: 0,
        errorInfo: {
          hasErrors: true,
          failedKeys: [],
          message: 'Failed to fetch reservation keys'
        }
      };
    }

    if (reservationKeys.length === 0) {
      devLog.log('🔧 [SERVICE] ℹ️ No reservation keys found for user');
      return {
        userAddress,
        bookings: [],
        totalBookings: 0,
        activeBookings: 0,
        pastBookings: 0,
        errorInfo: {
          hasErrors: false,
          failedKeys: [],
          message: 'No bookings found'
        }
      };
    }

    // Step 2: Get details for each reservation (with fault tolerance)
    devLog.log('🔧 [SERVICE] 📡 Fetching reservation details...');
    const bookingPromises = reservationKeys.map(async (key, index) => {
      try {
        const reservationResponse = await fetchReservationDetails(key);
        
        if (!reservationResponse || !reservationResponse.reservation) {
          devLog.warn(`⚠️ No reservation data returned for key: ${key}`);
          return { success: false, key, error: 'No reservation data' };
        }
        
        // Extract the actual reservation data from the response
        const reservationData = reservationResponse.reservation;
        
        // Extract fields from the reservation struct with safe fallbacks
        const labId = reservationData.labId;
        const renter = reservationData.renter; 
        const price = reservationData.price;
        const start = reservationData.start;
        const end = reservationData.end;
        const status = reservationData.status;
        
        // Validate required fields
        if (labId === undefined || labId === null) {
          devLog.warn(`⚠️ Missing labId for reservation key: ${key}`, reservationData);
          return { success: false, key, error: 'Missing labId' };
        }
        
        if (start === undefined || start === null || end === undefined || end === null) {
          devLog.warn(`⚠️ Missing timestamps for reservation key: ${key}`);
          return { success: false, key, error: 'Missing timestamps' };
        }
        
        // Convert to numbers safely
        const startNum = Number(start);
        const endNum = Number(end);
        const statusNum = Number(status || 0);
        
        // Validate converted numbers
        if (isNaN(startNum) || isNaN(endNum)) {
          devLog.warn(`⚠️ Invalid timestamps for reservation key: ${key}`, { start, end });
          return { success: false, key, error: 'Invalid timestamps' };
        }
        
        const now = Date.now() / 1000; // Current time in seconds
        
        const booking = {
          id: index,
          reservationKey: key,
          labId: labId.toString(),
          start: startNum.toString(), // Unix timestamp in seconds
          end: endNum.toString(), // Unix timestamp in seconds  
          status: statusNum.toString(),
          price: (price?.toString() || '0'),
          renter: (renter?.toString() || userAddress),
          date: new Date(startNum * 1000).toISOString().split('T')[0], // Add date field in YYYY-MM-DD format
          startDate: new Date(startNum * 1000),
          endDate: new Date(endNum * 1000),
          duration: endNum - startNum, // Duration in seconds
          isActive: now >= startNum && now < endNum,
          // Add additional fields from the API response
          reservationState: reservationData.reservationState,
          isPending: reservationData.isPending,
          isBooked: reservationData.isBooked,
          isUsed: reservationData.isUsed,
          isCollected: reservationData.isCollected,
          isCanceled: reservationData.isCanceled,
          isCompleted: reservationData.isCompleted,
          isConfirmed: reservationData.isConfirmed
        };
        
        return { success: true, key, booking };
        
      } catch (error) {
        devLog.error(`❌ Error processing reservation key ${key}:`, error);
        return { success: false, key, error: error.message };
      }
    });

    const bookingResults = await Promise.all(bookingPromises);
    
    // Separate successful and failed results
    const successfulBookings = bookingResults
      .filter(result => result.success)
      .map(result => result.booking);
    
    const failedKeys = bookingResults
      .filter(result => !result.success)
      .map(result => ({ key: result.key, error: result.error }));

    devLog.log(`🔧 [SERVICE] ✅ Successfully processed ${successfulBookings.length}/${bookingResults.length} bookings`);
    if (failedKeys.length > 0) {
      devLog.warn(`🔧 [SERVICE] ⚠️ Failed to process ${failedKeys.length} bookings:`, failedKeys);
    }

    // Step 3: Calculate statistics from successful bookings
    const now = Date.now() / 1000;
    const activeBookings = successfulBookings.filter(booking => {
      const start = parseInt(booking.start);
      const end = parseInt(booking.end);
      return now >= start && now < end;
    });
    
    const pastBookings = successfulBookings.filter(booking => {
      const end = parseInt(booking.end);
      return end < now;
    });

    const result = {
      userAddress,
      bookings: successfulBookings,
      totalBookings: successfulBookings.length,
      activeBookings: activeBookings.length,
      pastBookings: pastBookings.length,
      errorInfo: {
        hasErrors: failedKeys.length > 0,
        failedKeys,
        message: failedKeys.length > 0 
          ? `Successfully loaded ${successfulBookings.length} bookings, ${failedKeys.length} failed`
          : 'All bookings loaded successfully'
      }
    };

    devLog.log(`🔧 [SERVICE] ✅ Composed booking stats - Total: ${result.totalBookings}, Active: ${result.activeBookings}, Past: ${result.pastBookings}`);
    return result;

  } catch (error) {
    devLog.error('❌ Error in fetchUserBookingsComposed:', error);
    // Return partial data structure even on complete failure
    return {
      userAddress,
      bookings: [],
      totalBookings: 0,
      activeBookings: 0,
      pastBookings: 0,
      errorInfo: {
        hasErrors: true,
        failedKeys: [],
        message: `Service error: ${error.message}`
      }
    };
  }
};

/**
 * Fetch comprehensive lab booking data (composed service)
 * Orchestrates lab bookings with occupancy metrics
 * Tolerant to partial failures - returns available data with fallbacks
 * @param {string|number} labId - Lab ID
 * @param {boolean} includeMetrics - Whether to calculate occupancy metrics
 * @returns {Promise<Object>} Comprehensive lab booking data
 */
export const fetchLabBookingsComposed = async (labId, includeMetrics = true) => {
  if (!labId) {
    throw new Error('Lab ID is required for composed lab booking fetch');
  }

  devLog.log(`🔧 [SERVICE] 📊 Fetching composed lab bookings for lab ${labId}`);

  try {
    // Step 1: Get lab bookings (fundamental step)
    let labBookings = [];
    try {
      labBookings = await fetchLabBookings(labId);
      devLog.log(`🔧 [SERVICE] ✅ Fetched ${labBookings.length} lab bookings`);
    } catch (error) {
      devLog.error(`❌ Failed to fetch lab bookings for lab ${labId}:`, error);
      // Return empty result if we can't get bookings
      return {
        labId: labId.toString(),
        bookings: [],
        totalBookings: 0,
        metrics: includeMetrics ? {
          activeBookings: 0,
          completedBookings: 0,
          weeklyBookings: 0,
          monthlyBookings: 0,
          totalBookedHours: 0,
          averageBookingDuration: 0
        } : undefined,
        errorInfo: {
          hasErrors: true,
          message: `Failed to fetch lab bookings: ${error.message}`
        }
      };
    }

    // Early return for empty bookings or no metrics needed
    if (!includeMetrics || labBookings.length === 0) {
      return {
        labId: labId.toString(),
        bookings: labBookings,
        totalBookings: labBookings.length,
        errorInfo: {
          hasErrors: false,
          message: labBookings.length === 0 ? 'No bookings found for lab' : 'All bookings loaded successfully'
        }
      };
    }

    // Step 2: Calculate metrics with fault tolerance
    devLog.log(`🔧 [SERVICE] 📊 Calculating metrics for ${labBookings.length} bookings...`);
    
    try {
      const now = Date.now() / 1000; // Unix timestamp
      const dayInSeconds = 24 * 60 * 60;
      const weekAgo = now - (7 * dayInSeconds);
      const monthAgo = now - (30 * dayInSeconds);

      // Process each booking safely with enhanced validation
      const processedBookings = labBookings.map((booking, index) => {
        try {
          // More robust timestamp validation
          let start, end;
          
          // Try to parse start timestamp
          if (typeof booking.start === 'string' && booking.start.match(/^\d+$/)) {
            start = parseInt(booking.start);
          } else if (typeof booking.start === 'number') {
            start = booking.start;
          } else {
            devLog.warn(`⚠️ Invalid start timestamp for booking ${index} in lab ${labId}:`, { start: booking.start, type: typeof booking.start });
            return { ...booking, hasValidTimestamps: false, invalidReason: 'invalid_start' };
          }
          
          // Try to parse end timestamp
          if (typeof booking.end === 'string' && booking.end.match(/^\d+$/)) {
            end = parseInt(booking.end);
          } else if (typeof booking.end === 'number') {
            end = booking.end;
          } else {
            devLog.warn(`⚠️ Invalid end timestamp for booking ${index} in lab ${labId}:`, { end: booking.end, type: typeof booking.end });
            return { ...booking, hasValidTimestamps: false, invalidReason: 'invalid_end' };
          }
          
          // Validate the parsed numbers are reasonable timestamps
          if (isNaN(start) || isNaN(end) || start <= 0 || end <= 0 || start >= end) {
            devLog.warn(`⚠️ Invalid timestamps for booking ${index} in lab ${labId}:`, { start: booking.start, end: booking.end, parsedStart: start, parsedEnd: end });
            return { ...booking, hasValidTimestamps: false, invalidReason: 'invalid_values' };
          }
          
          const status = booking.status?.toString() || '0';

          return {
            ...booking,
            hasValidTimestamps: true,
            startNum: start,
            endNum: end,
            status,
            duration: end - start,
            // Add date field for filtering compatibility
            date: new Date(start * 1000).toLocaleDateString('en-CA'), // YYYY-MM-DD format
            // Ensure required fields are present
            labId: booking.labId || labId,
            renter: booking.renter || booking.userAddress
          };
        } catch (error) {
          devLog.warn(`⚠️ Error processing booking ${index} in lab ${labId}:`, error);
          return { ...booking, hasValidTimestamps: false, invalidReason: 'processing_error' };
        }
      });

      // Filter valid bookings for metrics
      const validBookings = processedBookings.filter(booking => booking.hasValidTimestamps);
      const invalidCount = processedBookings.length - validBookings.length;

      if (invalidCount > 0) {
        devLog.warn(`🔧 [SERVICE] ⚠️ ${invalidCount} bookings have invalid data and were excluded from metrics`);
      }

      // Calculate metrics from valid bookings
      const activeBookings = validBookings.filter(booking => booking.status === '1');
      const completedBookings = validBookings.filter(booking => booking.status === '2' || booking.status === '3');
      const weeklyBookings = validBookings.filter(booking => booking.startNum >= weekAgo);
      const monthlyBookings = validBookings.filter(booking => booking.startNum >= monthAgo);

      // Calculate total booked hours
      const totalBookedHours = validBookings.reduce((total, booking) => {
        try {
          const duration = booking.duration / 3600; // Convert to hours
          return total + (isNaN(duration) ? 0 : duration);
        } catch (error) {
          devLog.warn(`⚠️ Error calculating duration for booking in lab ${labId}:`, error);
          return total;
        }
      }, 0);

      const metrics = {
        activeBookings: activeBookings.length,
        completedBookings: completedBookings.length,
        weeklyBookings: weeklyBookings.length,
        monthlyBookings: monthlyBookings.length,
        totalBookedHours: Math.round(totalBookedHours * 100) / 100, // Round to 2 decimals
        averageBookingDuration: validBookings.length > 0 
          ? Math.round((totalBookedHours / validBookings.length) * 100) / 100 
          : 0
      };

      devLog.log(`🔧 [SERVICE] ✅ Metrics calculated - Active: ${metrics.activeBookings}, Completed: ${metrics.completedBookings}`);

      return {
        labId: labId.toString(),
        bookings: labBookings, // Return original bookings (including invalid ones for debugging)
        totalBookings: labBookings.length,
        metrics,
        errorInfo: {
          hasErrors: invalidCount > 0,
          message: invalidCount > 0 
            ? `Metrics calculated from ${validBookings.length}/${labBookings.length} valid bookings`
            : 'All bookings processed successfully'
        }
      };

    } catch (error) {
      devLog.error(`❌ Error calculating metrics for lab ${labId}:`, error);
      
      // Return bookings without metrics if metrics calculation fails
      return {
        labId: labId.toString(),
        bookings: labBookings,
        totalBookings: labBookings.length,
        metrics: {
          activeBookings: 0,
          completedBookings: 0,
          weeklyBookings: 0,
          monthlyBookings: 0,
          totalBookedHours: 0,
          averageBookingDuration: 0
        },
        errorInfo: {
          hasErrors: true,
          message: `Metrics calculation failed: ${error.message}. Bookings data available.`
        }
      };
    }

  } catch (error) {
    devLog.error(`❌ Error in fetchLabBookingsComposed for lab ${labId}:`, error);
    
    // Return minimal structure on complete failure
    return {
      labId: labId.toString(),
      bookings: [],
      totalBookings: 0,
      metrics: includeMetrics ? {
        activeBookings: 0,
        completedBookings: 0,
        weeklyBookings: 0,
        monthlyBookings: 0,
        totalBookedHours: 0,
        averageBookingDuration: 0
      } : undefined,
      errorInfo: {
        hasErrors: true,
        message: `Service error: ${error.message}`
      }
    };
  }
};

/**
 * Fetch multi-lab booking data (composed service)
 * Efficiently fetches bookings for multiple labs in parallel
 * @param {Array<string|number>} labIds - Array of lab IDs
 * @param {boolean} includeMetrics - Whether to include metrics for each lab
 * @returns {Promise<Object>} Multi-lab booking data
 */
export const fetchMultiLabBookingsComposed = async (labIds, includeMetrics = false) => {
  if (!Array.isArray(labIds) || labIds.length === 0) {
    throw new Error('Array of lab IDs is required');
  }

  try {
    // Fetch all lab bookings in parallel (each uses efficient pattern)
    const bookingPromises = labIds.map(labId => 
      fetchLabBookingsComposed(labId, includeMetrics).catch(error => ({
        labId,
        error: error.message,
        bookings: [],
        totalBookings: 0
      }))
    );

    const results = await Promise.all(bookingPromises);
    
    // Aggregate results
    const totalBookings = results.reduce((sum, result) => sum + (result.totalBookings || 0), 0);
    const successfulLabs = results.filter(result => !result.error);
    const failedLabs = results.filter(result => result.error);

    return {
      labIds,
      results,
      summary: {
        totalBookings,
        successfulLabs: successfulLabs.length,
        failedLabs: failedLabs.length,
        averageBookingsPerLab: successfulLabs.length > 0 
          ? Math.round((totalBookings / successfulLabs.length) * 100) / 100 
          : 0
      }
    };

  } catch (error) {
    devLog.error('Error in fetchMultiLabBookingsComposed:', error);
    throw error;
  }
};

/**
 * Claim all available balance (atomic service)
 * @returns {Promise<Object>} Transaction result
 */
export const claimAllBalance = async () => {
  devLog.log('📤 [serverBookingServices] Claiming all balance');

  const response = await fetch('/api/contract/reservation/claimAllBalanceSSO', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  devLog.log('✅ [serverBookingServices] Successfully claimed all balance:', data);
  return data;
};

/**
 * Claim balance for specific lab (atomic service)
 * @param {string|number} labId - Lab identifier
 * @returns {Promise<Object>} Transaction result
 */
export const claimLabBalance = async (labId) => {
  if (!labId && labId !== 0) {
    throw new Error('Lab ID is required for claiming lab balance');
  }

  devLog.log('📤 [serverBookingServices] Claiming lab balance for lab:', labId);

  const response = await fetch('/api/contract/reservation/claimLabBalanceSSO', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ labId })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  devLog.log('✅ [serverBookingServices] Successfully claimed lab balance:', data);
  return data;
};

// Export all services
export const serverBookingServices = {
  // Atomic services
  fetchUserBookings,
  fetchLabBookings,
  fetchReservationDetails,
  createBooking,
  cancelBooking,
  cancelReservationRequest,
  claimAllBalance,
  claimLabBalance,
  
  // Composed services
  fetchUserBookingsComposed,
  fetchLabBookingsComposed,
  fetchMultiLabBookingsComposed,
  cancelReservation
};
