/**
 * Optimized component for displaying active booking status
 * Uses useActiveUserBooking for minimal data fetching
 */
import React from 'react';
import PropTypes from 'prop-types';
import { useActiveUserBooking } from '@/hooks/booking/useBookings';
import { useLab } from '@/hooks/lab/useLabs';
import ActiveLabCard from './ActiveLabCard';

/**
 * Renders the active booking section with optimized data fetching
 * @param {Object} props - Component props
 * @param {string} props.userAddress - User wallet address
 * @param {Object} [props.options] - Hook options
 * @returns {JSX.Element} Active booking section
 */
export default function ActiveBookingSection({ userAddress, options = {} }) {
  // ✅ Use specialized hook for active booking only
  const { 
    data: activeBookingData, 
    isLoading: activeBookingLoading,
    isError: activeBookingError 
  } = useActiveUserBooking(userAddress, options);

  const { activeBooking, nextBooking, hasActiveBooking } = activeBookingData || {};

  // Get lab details for the active/next booking
  const targetBooking = activeBooking || nextBooking;
  const { 
    data: labData, 
    isLoading: labLoading 
  } = useLab(targetBooking?.labId, {
    enabled: !!targetBooking?.labId
  });

  // Loading state
  if (activeBookingLoading || (targetBooking && labLoading)) {
    return (
      <div className="border shadow text-white rounded p-6 mb-1 h-full">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          <span className="ml-2">Loading active booking...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (activeBookingError) {
    return (
      <div className="border shadow text-white rounded p-6 mb-1 h-full">
        <div className="text-center text-red-300">
          Failed to load active booking status
        </div>
      </div>
    );
  }

  // Format booking times
  const getBookingTimes = (booking) => {
    if (!booking?.start || !booking?.end) return { start: null, end: null };
    
    const parseTimestamp = (timestamp) => {
      if (!timestamp) return null;
      const parsed = parseInt(timestamp);
      if (isNaN(parsed) || parsed <= 0) return null;
      const date = new Date(parsed * 1000);
      return date.getTime() && !isNaN(date.getTime()) ? date : null;
    };
    
    const startDate = parseTimestamp(booking.start);
    const endDate = parseTimestamp(booking.end);
    
    if (!startDate || !endDate) return { start: null, end: null };
    
    return {
      start: `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`,
      end: `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`
    };
  };

  return (
    <div className="border shadow text-white rounded p-6 mb-1 h-full">
      <div className="flex flex-col h-full">
        {/* Dynamic header based on available lab */}
        {hasActiveBooking && labData ? (
          <h2 className="text-2xl font-semibold mb-4 text-white text-center">
            Active now: {labData.name}
          </h2>
        ) : nextBooking && labData ? (
          <h2 className="text-2xl font-semibold mb-4 text-white text-center">
            Next: {labData.name}
          </h2>
        ) : null}
        
        {/* ActiveLabCard for available lab */}
        <div className="flex-1 flex items-center justify-center">
          {hasActiveBooking && labData ? (
            <ActiveLabCard
              lab={labData}
              booking={activeBooking}
              userAddress={userAddress}
              isActive={true}
              bookingTimes={getBookingTimes(activeBooking)}
            />
          ) : nextBooking && labData ? (
            <ActiveLabCard
              lab={labData}
              booking={nextBooking}
              userAddress={userAddress}
              isActive={false}
              bookingTimes={getBookingTimes(nextBooking)}
            />
          ) : (
            <span className="text-gray-300 text-center">
              No upcoming or active lab
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

ActiveBookingSection.propTypes = {
  userAddress: PropTypes.string.isRequired,
  options: PropTypes.object
};
