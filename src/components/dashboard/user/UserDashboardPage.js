"use client";
import React, { useEffect, useState, useMemo } from 'react'
import { useAccount } from 'wagmi'
import { useUser } from '@/context/UserContext'
import { useNotifications } from '@/context/NotificationContext'
import { useAllLabsComposed } from '@/utils/hooks/queries/labsComposedQueries'
import { useUserBookingsComposed } from '@/utils/hooks/queries/bookingsComposedQueries'
import { useCancelBooking, useCancelReservationRequest } from '@/hooks/booking/useBookings'
import { useReservationEventCoordinator } from '@/hooks/booking/useBookingEventCoordinator'
import AccessControl from '@/components/auth/AccessControl'
import { DashboardSectionSkeleton } from '@/components/skeletons'
import CalendarWithBookings from '@/components/booking/CalendarWithBookings'
import DashboardHeader from '@/components/dashboard/user/DashboardHeader'
import ActiveLabCard from '@/components/dashboard/user/ActiveLabCard'
import BookingsList from '@/components/dashboard/user/BookingsList'
import devLog from '@/utils/dev/logger'
import isBookingActive from '@/utils/booking/isBookingActive'

export default function UserDashboard() {
  const { isLoggedIn, address, user, isSSO } = useUser();
  
  // 🚀 React Query for labs with enriched metadata
  const { 
    data: labsData,
    isLoading: loading, 
    isError: labsError,
    error: labsErrorDetails 
  } = useAllLabsComposed({
    includeMetadata: true, // Include metadata to get lab names
    includeOwners: false
  });
  const labs = labsData?.labs || [];

  // 🚀 React Query for user bookings with lab details
  const { 
    data: userBookingsData, 
    isLoading: bookingsLoading, 
    isError: bookingsError,
    error: bookingsErrorDetails 
  } = useUserBookingsComposed(address, {
    includeLabDetails: true,
    queryOptions: {
    enabled: !!address && isLoggedIn
    }
  });

  // Extract bookings array from composed service response
  const userBookings = useMemo(() => 
    userBookingsData?.bookings || [], 
    [userBookingsData?.bookings]
  );

  const { addPersistentNotification, addErrorNotification } = useNotifications();
  const { coordinatedBookingCancellation } = useReservationEventCoordinator();

  // 🚀 Unified React Query mutations for cancellation
  const cancelBookingUnified = useCancelBooking();
  const cancelReservationUnified = useCancelReservationRequest();

  // Debug: Log booking data from React Query
  useEffect(() => {
    console.log('UserDashboard: Received labs data:', {
      labsCount: labs.length,
      address,
      labs: labs.slice(0, 3).map(lab => ({
        id: lab.id,
        name: lab.name
      }))
    });
  }, [labs.length, address]);

  useEffect(() => {
    console.log('UserDashboard: Received user bookings data:', {
      userBookingsCount: userBookings.length,
      address,
      userBookings: userBookings.slice(0, 3).map(booking => ({
        reservationKey: booking.reservationKey,
        labId: booking.labId,
        status: booking.status
      }))
    });
  }, [userBookings.length, address]);

  const { isConnected } = useAccount();
  
  // State for UI feedback only
  const [failedCancellations, setFailedCancellations] = useState(new Set());
  const [selectedBooking, setSelectedBooking] = useState(null);

  const bookingInfo = useMemo(() => {
    if (!userBookings || !labs) return [];
    
    return userBookings.map(booking => {
      const lab = labs.find(l => String(l.id) === String(booking.labId));
      
      // Safe date parsing function
      const parseTimestamp = (timestamp) => {
        if (!timestamp) return null;
        const parsed = parseInt(timestamp);
        if (isNaN(parsed) || parsed <= 0) return null;
        const date = new Date(parsed * 1000);
        return date.getTime() && !isNaN(date.getTime()) ? date : null;
      };
      
      const startDate = parseTimestamp(booking.start);
      const endDate = parseTimestamp(booking.end);
      
      return {
        ...booking,
        labName: lab?.name ?? `Lab ${booking.labId}`,
        status: booking.status,
        // Ensure date field exists for calendar compatibility
        date: booking.date || (startDate ? startDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]),
        // Add formatted times for display
        startTime: startDate ? startDate.toLocaleTimeString() : 'N/A',
        endTime: endDate ? endDate.toLocaleTimeString() : 'N/A'
      };
    });
  }, [userBookings, labs]);
  
  // Additional state variables
  const [userData, setUserData] = useState(null);
  const [now, setNow] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLabId, setSelectedLabId] = useState(null);
  
  // Initialize time on client side only
  useEffect(() => {
    setNow(new Date());
  }, []);

  // Update availableLab when labs or now changes
  const availableLab = useMemo(() => {
    if (!labs?.length || !now || !userBookings?.length) return null;
    
    // Find a lab with active bookings using userBookings from BookingContext
    const labsWithActiveBookings = labs.filter(lab => {
  const labUserBookings = userBookings?.filter(booking => String(booking.labId) === String(lab.id)) || [];
      return isBookingActive(labUserBookings);
    });
    return labsWithActiveBookings[0] || null;
  }, [labs, now, userBookings]);
      
  const openModal = (type, labId, booking = null) => {
    setSelectedLabId(labId);
    setSelectedBooking(booking);
    setIsModalOpen(type);
  };

  const closeModal = () => {
    setIsModalOpen(null);
    setSelectedLabId(null);
    setSelectedBooking(null);
  };

  const handleClearCancellationError = (reservationKey) => {
    setFailedCancellations(prev => {
      const newSet = new Set(prev);
      newSet.delete(reservationKey);
      return newSet;
    });
  };

  // 🚀 React Query booking cancellation handler
  const handleCancellation = async (booking) => {
    if (!booking || !booking.reservationKey) {
      devLog.error('Missing booking or reservation key:', booking);
      addErrorNotification('No booking selected or missing reservation key', '');
      return;
    }

    // Check if already canceled
    if (booking.status === "4" || booking.status === 4) {
      addErrorNotification('This reservation is already canceled', '');
      return;
    }

    // Require wallet only for wallet path; allow SSO without wallet
    if (!isSSO && !isConnected) {
      addErrorNotification('Please connect your wallet first', '');
      return;
    }

    // Clear any previous cancellation error for this booking
    setFailedCancellations(prev => {
      const newSet = new Set(prev);
      newSet.delete(booking.reservationKey);
      return newSet;
    });

    setSelectedBooking(booking);
    
    try {
      // 🚀 Route by status: pending -> cancel reservation request; booked -> cancel booking
      const isPending = booking.status === 0 || booking.status === '0';
      if (isPending) {
        // Fire transaction but do NOT remove from UI yet; wait for chain event
        await cancelReservationUnified.mutateAsync(booking.reservationKey);
      } else {
        // Fire transaction but do NOT remove from UI yet; wait for chain event
        await cancelBookingUnified.mutateAsync(booking.reservationKey);
      }

      // UI removal is handled by BookingEventContext upon on-chain confirmation
      // This prevents premature list updates and avoids full list refreshes
    } catch (error) {
      devLog.error('Cancellation failed:', error);
      
      // Add to failed cancellations for visual feedback
      setFailedCancellations(prev => new Set([...prev, booking.reservationKey]));
      
      // Auto-clear failed state after 5 seconds
      setTimeout(() => {
        setFailedCancellations(prev => {
          const newSet = new Set(prev);
          newSet.delete(booking.reservationKey);
          return newSet;
        });
      }, 5000);
      
      if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
        addPersistentNotification('warning', '🚫 Transaction rejected by user.');
      } else {
        // Pass the full error to let NotificationContext derive a concise message
        addErrorNotification(error, 'Cancellation failed');
      }
    }
  };

  const handleRefund = () => {
    closeModal();
  };

  // Calendar
  const today = new Date();
  const [date, setDate] = useState(new Date());

  // If there is no active booking, search for the first one in the future
  const firstActiveLab = useMemo(() => {
    if (availableLab || !now || !labs.length) return null;
    
    return labs
      .map(lab => {
        // Get user bookings for this lab from React Query data
        const labUserBookings = userBookings?.filter(booking => String(booking.labId) === String(lab.id)) || [];
        if (!Array.isArray(labUserBookings)) return null;
        const futureBooking = labUserBookings
          .filter(b => b.start && parseInt(b.start) * 1000 > now.getTime())
          .sort((a, b) => parseInt(a.start) - parseInt(b.start))[0];
        return futureBooking ? { lab, booking: futureBooking } : null;
      })
      .filter(Boolean)
      .sort((a, b) => parseInt(a.booking.start) - parseInt(b.booking.start))[0]?.lab;
  }, [availableLab, now, labs, userBookings]);

  // Find active booking or the next one in the future (must be defined before any early returns)
  const activeBooking = useMemo(() => {
    if (!availableLab || !userBookings) return null;
    return userBookings
      .filter(booking => String(booking.labId) === String(availableLab.id))
      .find(b => isBookingActive([b]));
  }, [availableLab, userBookings]);

  const nextBooking = useMemo(() => {
    if (availableLab || !firstActiveLab || !userBookings || !now) return null;
    return userBookings
      .filter(booking => String(booking.labId) === String(firstActiveLab.id))
      .filter(b => b.start && parseInt(b.start) * 1000 > now.getTime())
      .sort((a, b) => parseInt(a.start) - parseInt(b.start))[0];
  }, [availableLab, firstActiveLab, userBookings, now]);

  // To show starting and ending times of bookings
  const getBookingTimes = booking => {
    if (!booking?.start || !booking?.end) return { start: null, end: null };
    
    // Safe date parsing
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

  // Simulate user data fetching
  useEffect(() => {
    if (isLoggedIn && labs.length > 0) {
      const userid = address || user?.id;
      const affiliation = user?.affiliation || 'Unknown';
      setUserData({
        userid: userid,
        affiliation: affiliation,
        labs: labs,
      });
    }
  }, [isLoggedIn, labs.length, address, user?.id, user?.affiliation]);

  if (!now || (!userData && loading)) {
    return (
      <AccessControl message="Please log in to view and make reservations.">
        <div className="container mx-auto p-4 space-y-6">
          <DashboardSectionSkeleton />
          <div className="flex md:flex-row flex-col gap-4">
            <div className="md:w-1/2">
              <DashboardSectionSkeleton />
            </div>
            <div className="md:w-1/2">
              <DashboardSectionSkeleton />
            </div>
          </div>
        </div>
      </AccessControl>
    )
  }

  if (loading) {
    return (
      <AccessControl message="Please log in to view your dashboard.">
        <div className="container mx-auto p-4 space-y-6">
          <DashboardSectionSkeleton />
          <div className="flex md:flex-row flex-col gap-4">
            <div className="md:w-1/2">
              <DashboardSectionSkeleton />
            </div>
            <div className="md:w-1/2">
              <DashboardSectionSkeleton />
            </div>
          </div>
        </div>
      </AccessControl>
    )
  }

  

  // ❌ Error handling for React Query
  if (labsError || bookingsError) {
    return (
      <AccessControl message="Please log in to view and make reservations.">
        <div className="container mx-auto p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
            <h2 className="text-red-800 text-xl font-semibold mb-2">Error Loading Dashboard</h2>
            <p className="text-red-600 mb-4">
              {labsError && (labsErrorDetails?.message || 'Failed to load laboratory data')}
              {bookingsError && (bookingsErrorDetails?.message || 'Failed to load booking data')}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </AccessControl>
    );
  }

  return (
    <AccessControl message="Please log in to view and make reservations.">
      <div className="container mx-auto p-4">
        <DashboardHeader title="User Dashboard" />

        <div>
          <div className="bg-white shadow-md rounded-lg p-6 mb-6 w-1/6 h-1/3 
            hidden">
            <h2 className="text-2xl font-semibold mb-4 text-gray-800 text-center">
              Profile
            </h2>
            <p className="text-gray-700">
              <strong>Name:</strong>{userData?.name || 'N/A'}
            </p>
            <p className="text-gray-700 break-words">
              <strong>Email:</strong> {userData?.email || 'N/A'}
            </p>
          </div>

          <div className='flex-1'>
            {/* Dev logging for partial data issues - no user warning */}
            {userBookingsData?.errorInfo?.hasErrors && (
              devLog.warn('Partial bookings data loaded:', {
                message: userBookingsData.errorInfo.message,
                failedKeys: userBookingsData.errorInfo.failedKeys,
                userAddress: address
              })
            )}
            
            <div className='flex min-[1280px]:flex-row flex-col'>
              <div className="border shadow text-white rounded p-6 mb-1 min-[1280px]:mr-1 min-[1280px]:w-3/4">
                <div className="flex flex-col">
                  {/* Dynamic header based on available lab */}
                  {availableLab ? (
                    <h2 className="text-2xl font-semibold mb-4 text-white text-center">
                      Active now: {availableLab.name}
                    </h2>
                  ) : firstActiveLab ? (
                    <h2 className="text-2xl font-semibold mb-4 text-white text-center">
                      Next: {firstActiveLab.name}
                    </h2>
                  ) : null}
                  
                  {/* ActiveLabCard for available lab */}
                  {availableLab ? (
                    <ActiveLabCard
                      lab={availableLab}
                      booking={activeBooking}
                      userAddress={user?.userid || address}
                      isActive={true}
                      bookingTimes={getBookingTimes(activeBooking)}
                    />
                  ) : firstActiveLab && nextBooking ? (
                    <ActiveLabCard
                      lab={firstActiveLab}
                      booking={nextBooking}
                      userAddress={user?.userid || address}
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
              {/* CALENDAR */}
              <div className="border shadow text-white rounded p-6 mb-1 flex-1 min-[1280px]:w-1/4 flex justify-center 
                items-center">
                <div className="flex flex-row">
                  <CalendarWithBookings
                    selectedDate={date}
                    onDateChange={(newDate) => setDate(newDate)}
                    bookingInfo={bookingInfo}
                    minDate={today}
                    displayMode="user-dashboard"
                  />
                </div>
              </div>
            </div>
            {/* Bottom panel: bookings lists */}
            <div className="flex min-[1280px]:flex-row flex-col gap-4 mt-6">
              {/* Upcoming bookings list */}
              <BookingsList
                bookings={userBookings}
                labs={labs}
                currentTime={now}
                isLoading={bookingsLoading}
                type="upcoming"
                onCancel={handleCancellation}
                onClearError={handleClearCancellationError}
                failedCancellations={failedCancellations}
                closeModal={closeModal}
              />
              
              {/* Vertical divider */}
              <div className="min-[1280px]:mt-1 min-[1280px]:mx-3 min-[1280px]:w-px min-[1280px]:self-stretch bg-gradient-to-tr 
                from-transparent via-neutral-800 to-transparent opacity-90 
                dark:via-neutral-200 border-l border-neutral-800 
                dark:border-neutral-200 border-dashed"
                style={{ borderWidth: '4px', borderLeftStyle: 'dashed' }} />

              {/* Past bookings list */}
              <BookingsList
                bookings={userBookings}
                labs={labs}
                currentTime={now}
                isLoading={bookingsLoading}
                type="past"
                onRefund={(labId, booking) => openModal('refund', labId, booking)}
                onConfirmRefund={handleRefund}
                isModalOpen={isModalOpen}
                selectedBooking={selectedBooking}
                selectedLabId={selectedLabId}
                closeModal={closeModal}
              />
            </div>
          </div>
        </div>
      </div>
    </AccessControl>
  )
}