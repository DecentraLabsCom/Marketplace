/**
 * Optimized component for displaying active booking status
 * Uses useUserBookingsDashboard for enriched lab data with metadata and provider names
 */
import React, { useMemo, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useUserBookingsDashboard } from '@/hooks/booking/useBookings';
import ActiveLabCard from './ActiveLabCard';

/**
 * Renders the active booking section with optimized data fetching
 * @param {Object} props - Component props
 * @param {string} props.userAddress - User wallet address
 * @param {Object} [props.options] - Hook options
 * @returns {JSX.Element} Active booking section
 */
export default function ActiveBookingSection({ userAddress, options = {} }) {
  // Force re-render every minute to check if booking status changed
  const [, setTick] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(tick => tick + 1);
    }, 60000); // Update every minute
    
    return () => clearInterval(interval);
  }, []);

  // ✅ Use composed hook for enriched lab data with metadata and provider names
  const { 
    data: userBookingsData, 
    isLoading: activeBookingLoading,
    isError: activeBookingError 
  } = useUserBookingsDashboard(userAddress, {
    includeLabDetails: true, // ✅ Enable enriched lab details with metadata and provider names
    queryOptions: {
      enabled: !!userAddress && (options.enabled !== false),
      staleTime: 30 * 1000, // 30 seconds for active booking updates
      ...options.queryOptions,
    }
  });

  // Extract active and next booking from enriched data
  const { activeBooking, nextBooking, hasActiveBooking, labData } = useMemo(() => {
    const bookings = userBookingsData?.bookings || [];
    const now = Math.floor(Date.now() / 1000);
    
    // Find current active booking
    const active = bookings.find(booking => {
      const start = parseInt(booking.start);
      const end = parseInt(booking.end);
      const status = parseInt(booking.status);
      
      return status === 1 && start <= now && end >= now;
    }) || null;

    // Find next upcoming booking (if no active booking)
    const next = !active ? bookings
      .filter(booking => {
        const start = parseInt(booking.start);
        const status = parseInt(booking.status);
        
        return (status === 0 || status === 1) && start > now;
      })
      .sort((a, b) => parseInt(a.start) - parseInt(b.start))[0] || null : null;

    // Extract lab data from the target booking (active or next)
    const targetBooking = active || next;
    // ✅ labDetails now comes pre-formatted from the composed hook
    const enrichedLabData = targetBooking?.labDetails || null;

    return {
      activeBooking: active,
      nextBooking: next,
      hasActiveBooking: !!active,
      labData: enrichedLabData
    };
  }, [userBookingsData?.bookings]);

  // Loading state
  if (activeBookingLoading) {
    return (
      <div className="border shadow text-white rounded p-6 mb-1 h-full">
        <div className="flex-center">
          <div className="spinner-lg border-white"></div>
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
        <div className="w-full">
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
