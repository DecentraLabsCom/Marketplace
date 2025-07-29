/**
 * Booking Services - Atomic and Composed
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

  const response = await fetch('/api/contract/reservation/makeBooking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ labId, start, timeslot })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
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

  const response = await fetch('/api/contract/reservation/cancelBooking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reservationKey })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
};

// ===========================
// COMPOSED SERVICES (orchestrate multiple atomic calls)
// ===========================

/**
 * Fetch comprehensive user booking data (composed service)
 * Orchestrates user bookings with additional context
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
    // Use atomic service - fetchUserBookings already orchestrates the contract calls
    const userBookings = await fetchUserBookings(userAddress);

    devLog.log(`🔧 [SERVICE] ✅ Fetched ${userBookings.length} user bookings`);

    // Simple composition: add summary statistics
    const now = Date.now() / 1000;
    const activeBookings = userBookings.filter(booking => {
      const start = parseInt(booking.start);
      const end = parseInt(booking.end);
      return now >= start && now < end;
    });
    
    const pastBookings = userBookings.filter(booking => {
      const end = parseInt(booking.end);
      return end < now;
    });

    const result = {
      userAddress,
      bookings: userBookings,
      totalBookings: userBookings.length,
      activeBookings: activeBookings.length,
      pastBookings: pastBookings.length
    };

    devLog.log(`🔧 [SERVICE] ✅ Composed booking stats - Total: ${result.totalBookings}, Active: ${result.activeBookings}, Past: ${result.pastBookings}`);
    return result;

  } catch (error) {
    devLog.error('❌ Error in fetchUserBookingsComposed:', error);
    throw error;
  }
};

/**
 * Fetch comprehensive lab booking data (composed service)
 * Orchestrates lab bookings with occupancy metrics
 * @param {string|number} labId - Lab ID
 * @param {boolean} includeMetrics - Whether to calculate occupancy metrics
 * @returns {Promise<Object>} Comprehensive lab booking data
 */
export const fetchLabBookingsComposed = async (labId, includeMetrics = true) => {
  if (!labId) {
    throw new Error('Lab ID is required for composed lab booking fetch');
  }

  try {
    // Get lab bookings (efficient: uses getReservationsOfToken + getReservationOfTokenByIndex)
    const labBookings = await fetchLabBookings(labId);

    if (!includeMetrics || labBookings.length === 0) {
      return {
        labId,
        bookings: labBookings,
        totalBookings: labBookings.length
      };
    }

    // Calculate metrics
    const now = Date.now() / 1000; // Unix timestamp
    const dayInSeconds = 24 * 60 * 60;
    const weekAgo = now - (7 * dayInSeconds);
    const monthAgo = now - (30 * dayInSeconds);

    const activeBookings = labBookings.filter(booking => booking.status === '1');
    const completedBookings = labBookings.filter(booking => booking.status === '2' || booking.status === '3');
    const weeklyBookings = labBookings.filter(booking => parseInt(booking.start) >= weekAgo);
    const monthlyBookings = labBookings.filter(booking => parseInt(booking.start) >= monthAgo);

    // Calculate total booked hours
    const totalBookedHours = labBookings.reduce((total, booking) => {
      const duration = (parseInt(booking.end) - parseInt(booking.start)) / 3600; // Convert to hours
      return total + duration;
    }, 0);

    return {
      labId,
      bookings: labBookings,
      totalBookings: labBookings.length,
      metrics: {
        activeBookings: activeBookings.length,
        completedBookings: completedBookings.length,
        weeklyBookings: weeklyBookings.length,
        monthlyBookings: monthlyBookings.length,
        totalBookedHours: Math.round(totalBookedHours * 100) / 100, // Round to 2 decimals
        averageBookingDuration: labBookings.length > 0 
          ? Math.round((totalBookedHours / labBookings.length) * 100) / 100 
          : 0
      }
    };

  } catch (error) {
    console.error('Error in fetchLabBookingsComposed:', error);
    throw error;
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
    console.error('Error in fetchMultiLabBookingsComposed:', error);
    throw error;
  }
};

// Export all services
export const bookingServices = {
  // Atomic services
  fetchUserBookings,
  fetchLabBookings,
  fetchReservationDetails,
  createBooking,
  cancelBooking,
  
  // Composed services
  fetchUserBookingsComposed,
  fetchLabBookingsComposed,
  fetchMultiLabBookingsComposed
};
