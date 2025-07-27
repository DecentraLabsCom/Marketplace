/**
 * Booking API Services
 * Handles all booking-related API operations
 */
import devLog from '@/utils/dev/logger'

export const bookingServices = {
  /**
   * Fetch user bookings using existing API endpoints
   */
  async fetchUserBookings(userAddress, fromDate = null, toDate = null) {
    if (!userAddress) {
      throw new Error('User address is required');
    }

    try {
      const params = new URLSearchParams({
        userAddress,
        ...(fromDate && { fromDate }),
        ...(toDate && { toDate }),
      });

      devLog.log(`Fetching user bookings for ${userAddress}`);
      
      const response = await fetch(`/api/contract/reservation/getUserBookings?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      // The endpoint may return { bookings: [...] } or directly the array
      const bookings = result.bookings || result || [];
      
      devLog.log(`Fetched ${Array.isArray(bookings) ? bookings.length : 0} user bookings`);
      return Array.isArray(bookings) ? bookings : [];
    } catch (error) {
      devLog.error('Error fetching user bookings:', error);
      throw new Error(`Failed to fetch user bookings: ${error.message}`);
    }
  },

  /**
   * Fetch bookings for a specific lab using existing API endpoints
   */
  async fetchLabBookings(labId, fromDate = null, toDate = null) {
    if (!labId) {
      throw new Error('Lab ID is required');
    }

    try {
      const params = new URLSearchParams({
        labId: labId.toString(),
        ...(fromDate && { fromDate }),
        ...(toDate && { toDate }),
      });

      devLog.log(`Fetching lab bookings for lab ${labId}`);
      
      const response = await fetch(`/api/contract/reservation/getLabBookings?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      // The endpoint may return { bookings: [...] } or directly the array
      const bookings = result.bookings || result || [];
      
      devLog.log(`Fetched ${Array.isArray(bookings) ? bookings.length : 0} lab bookings`);
      return Array.isArray(bookings) ? bookings : [];
    } catch (error) {
      devLog.error('Error fetching lab bookings:', error);
      throw new Error(`Failed to fetch lab bookings: ${error.message}`);
    }
  },

  /**
   * Create a new booking using existing API endpoint
   */
  async createBooking(labId, startTime, endTime, config = {}) {
    if (!labId || !startTime || !endTime) {
      throw new Error('Lab ID, start time, and end time are required');
    }

    try {
      devLog.log(`Creating booking for lab ${labId} from ${startTime} to ${endTime}`);
      
      const response = await fetch('/api/contract/reservation/makeBooking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          labId: labId.toString(),
          startTime,
          endTime,
          ...config
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      devLog.log('Booking created successfully:', result);
      return result;
    } catch (error) {
      devLog.error('Error creating booking:', error);
      throw new Error(`Failed to create booking: ${error.message}`);
    }
  },

  /**
   * Cancel an existing booking using existing API endpoint
   */
  async cancelBooking(bookingId) {
    if (!bookingId) {
      throw new Error('Booking ID is required');
    }

    try {
      devLog.log(`Cancelling booking ${bookingId}`);
      
      const response = await fetch('/api/contract/reservation/cancelBooking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: bookingId.toString() })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      devLog.log('Booking cancelled successfully:', result);
      return result;
    } catch (error) {
      devLog.error('Error cancelling booking:', error);
      throw new Error(`Failed to cancel booking: ${error.message}`);
    }
  },

  /**
   * Confirm a reservation request
   */
  async confirmReservationRequest(reservationKey) {
    if (!reservationKey) {
      throw new Error('Reservation key is required');
    }

    try {
      devLog.log(`Confirming reservation request: ${reservationKey}`);
      
      const response = await fetch('/api/contract/reservation/confirmReservationRequest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reservationKey }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      devLog.log('✅ Reservation confirmed:', result);
      
      return result;
    } catch (error) {
      devLog.error('Error confirming reservation request:', error);
      throw new Error(`Failed to confirm reservation: ${error.message}`);
    }
  },

  /**
   * Deny a reservation request
   */
  async denyReservationRequest(reservationKey, reason = 'Denied by provider') {
    if (!reservationKey) {
      throw new Error('Reservation key is required');
    }

    try {
      devLog.log(`Denying reservation request: ${reservationKey}`);
      
      const response = await fetch('/api/contract/reservation/denyReservationRequest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reservationKey, reason }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      devLog.log('✅ Reservation denied:', result);
      
      return result;
    } catch (error) {
      devLog.error('Error denying reservation request:', error);
      throw new Error(`Failed to deny reservation: ${error.message}`);
    }
  },
};
