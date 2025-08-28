/**
 * Optimized component for displaying user booking statistics
 * Uses useUserBookingsDashboard with summary analytics
 */
import React from 'react';
import PropTypes from 'prop-types';
import { useUserBookingsDashboard } from '@/hooks/booking/useBookings';
import devLog from '@/utils/dev/logger';

/**
 * Renders booking statistics with optimized data fetching
 * @param {Object} props - Component props
 * @param {string} props.userAddress - User wallet address
 * @param {Object} [props.options] - Hook options
 * @returns {JSX.Element} Booking summary section
 */
export default function BookingSummarySection({ userAddress, options = {} }) {
  const { 
    data: bookingsData, 
    isLoading: summaryLoading,
    isError: summaryError 
  } = useUserBookingsDashboard(userAddress, {
    includeLabDetails: false,
    queryOptions: options
  });

  // Extract summary data from bookings data
  const summaryData = bookingsData || {};
  const {
    totalBookings,
    activeBookings,
    upcomingBookings,
    completedBookings,
    pendingBookings
  } = summaryData;

  // Debug logging
  React.useEffect(() => {
    devLog.log('🎯 BookingSummarySection - Debug:', {
      userAddress,
      bookingsData,
      summaryData,
      isLoading: summaryLoading,
      isError: summaryError
    });
  }, [userAddress, bookingsData, summaryData, summaryLoading, summaryError]);

  // Loading state
  if (summaryLoading) {
    return (
      <div className="text-white p-6 mb-1 h-full">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full size-6 border-b-2 border-white"></div>
          <span className="ml-2 text-sm">Loading summary...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (summaryError) {
    return (
      <div className="text-white p-6 mb-1 h-full">
        <div className="text-center text-red-300 text-sm">
          Failed to load booking summary
        </div>
      </div>
    );
  }

  return (
    <div className="text-white mb-1 h-full">
      <h3 className="text-base font-semibold mb-3 text-center">Summary</h3>
      
      <div className="p-2">
        {/* Total Statistics */}
        <div className="text-center mb-3">
          <div className="text-2xl font-bold text-blue-300">{totalBookings || 0}</div>
          <div className="text-gray-300 text-s">Total Bookings</div>
        </div>

        {/* Status Breakdown */}
        <div className="border-t border-gray-600 pt-2">
          <div className="space-y-1 text-s">
            <div className="flex justify-between">
              <span className="text-gray-300">Active:</span>
              <span className="font-semibold text-green-300">{activeBookings || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">Upcoming:</span>
              <span className="font-semibold text-blue-300">{upcomingBookings || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">Pending:</span>
              <span className="font-semibold text-yellow-300">{pendingBookings || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-300">Completed:</span>
              <span className="font-semibold text-gray-300">{completedBookings || 0}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

BookingSummarySection.propTypes = {
  userAddress: PropTypes.string.isRequired,
  options: PropTypes.object
};
