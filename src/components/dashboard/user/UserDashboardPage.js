import React, { useEffect, useState, useMemo, useRef } from 'react'
import { Container, Stack } from '@/components/ui'
import { useUser } from '@/context/UserContext'
import { useNotifications } from '@/context/NotificationContext'
import { useOptionalBookingEventContext } from '@/context/BookingEventContext'
import { 
  useUserBookingsDashboard,
  useCancelBooking, 
  useCancelReservationRequest 
} from '@/hooks/booking/useBookings'
import AccessControl from '@/components/auth/AccessControl'
import { DashboardSectionSkeleton } from '@/components/skeletons'
import CalendarWithBookings from '@/components/booking/CalendarWithBookings'
import DashboardHeader from '@/components/dashboard/user/DashboardHeader'
import ActiveBookingSection from '@/components/dashboard/user/ActiveBookingSection'
import BookingSummarySection from '@/components/dashboard/user/BookingSummarySection'
import BookingsList from '@/components/dashboard/user/BookingsList'
import { mapBookingsForCalendar } from '@/utils/booking/calendarBooking'
import devLog from '@/utils/dev/logger'
import {
  notifyUserDashboardAlreadyCanceled,
  notifyUserDashboardCancellationProcessing,
  notifyUserDashboardCancellationSubmitted,
  notifyUserDashboardCancellationFailed,
  notifyUserDashboardCancellationRejected,
  notifyUserDashboardMissingBookingSelection,
  notifyUserDashboardWalletRequired,
} from '@/utils/notifications/userDashboardToasts'

/**
 * User dashboard page component
 * Displays user's bookings, active labs, calendar, and provides booking management
 * @returns {JSX.Element} Complete user dashboard with access control, bookings list, calendar, and actions
 */
export default function UserDashboard() {
  const { isLoggedIn, address, user, isSSO, isConnected, hasWalletSession } = useUser();
  
  // Debug: Log all click events in dashboard
  useEffect(() => {
    const handleClick = (e) => {
      console.log('[UserDashboard] Click detected:', {
        target: e.target,
        currentTarget: e.currentTarget,
        tagName: e.target.tagName,
        className: e.target.className,
        defaultPrevented: e.defaultPrevented,
        propagationStopped: e.cancelBubble,
      });
    };
    
    document.addEventListener('click', handleClick, true); // Use capture phase
    return () => document.removeEventListener('click', handleClick, true);
  }, []);
  
  // 🚀 React Query for user bookings with lab details
  // NOTE: useUserBookingsDashboard is a composed hook that works for BOTH SSO and Wallet users
  // It forces API mode (Ethers.js backend) because useQueries cannot extract Wagmi hooks as queryFn
  // API endpoints are read-only blockchain queries that work for any wallet address
  const canFetchBookings = Boolean(
    isLoggedIn && (isSSO || hasWalletSession) && (isSSO || address)
  );
  const effectiveUserAddress = isSSO ? null : address;
  const { 
    data: userBookingsData, 
    isLoading: bookingsLoading, 
    isError: bookingsError,
    error: bookingsErrorDetails 
  } = useUserBookingsDashboard(effectiveUserAddress, {
    includeLabDetails: true, // ✅ Enable lab details since we need lab.name in bookingInfo
    queryOptions: {
      enabled: canFetchBookings,
      staleTime: 5 * 60 * 1000, // 5 minutes - more dynamic bookings
      refetchOnMount: 'always',
      refetchOnWindowFocus: 'always',
      // No need to pass isSSO - hook forces API mode internally for architectural reasons
    }
  });

  // Extract bookings array from composed service response
  const userBookings = useMemo(() => 
    userBookingsData?.bookings || [], 
    [userBookingsData?.bookings]
  );

  const { addTemporaryNotification } = useNotifications();
  const { registerPendingCancellation } = useOptionalBookingEventContext();

  // 🚀 Unified React Query mutations for cancellation
  const cancelBookingUnified = useCancelBooking();
  const cancelReservationUnified = useCancelReservationRequest();

  // Debug: Log booking data from React Query
  useEffect(() => {
    devLog.log('UserDashboard: Received user bookings data:', {
      userBookingsCount: userBookings.length,
      address,
      userBookings: userBookings.slice(0, 3).map(booking => ({
        reservationKey: booking.reservationKey,
        labId: booking.labId,
        labName: booking.labDetails?.name,
        labDetails: booking.labDetails,
        status: booking.status
      }))
    });
  }, [userBookings.length, address]);
  
  // State for UI feedback only
  const [failedCancellations, setFailedCancellations] = useState(new Set());
  const [cancellationStates, setCancellationStates] = useState(new Map());
  const [selectedBooking, setSelectedBooking] = useState(null);
  const cancellingKeysRef = useRef(new Set());

  const setCancellationStage = (reservationKey, stage) => {
    if (!reservationKey) return;
    setCancellationStates((prev) => {
      const next = new Map(prev);
      if (!stage) {
        next.delete(reservationKey);
      } else {
        const label =
          stage === 'processing'
            ? 'Processing...'
            : 'Cancel Requested';
        next.set(reservationKey, {
          stage,
          isBusy: true,
          label,
        });
      }
      return next;
    });
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleCancelled = (event) => {
      const reservationKey = event?.detail?.reservationKey;
      if (!reservationKey) return;
      cancellingKeysRef.current.delete(reservationKey);
      setCancellationStage(reservationKey, null);
      setFailedCancellations((prev) => {
        const next = new Set(prev);
        next.delete(reservationKey);
        return next;
      });
    };

    window.addEventListener('reservation-cancelled', handleCancelled);
    return () => window.removeEventListener('reservation-cancelled', handleCancelled);
  }, []);

  useEffect(() => {
    if (!Array.isArray(userBookings) || userBookings.length === 0) {
      setCancellationStates(new Map());
      return;
    }

    const existingKeys = new Set(
      userBookings.map((booking) => booking?.reservationKey).filter(Boolean)
    );
    setCancellationStates((prev) => {
      const next = new Map();
      prev.forEach((value, key) => {
        if (existingKeys.has(key)) {
          next.set(key, value);
        }
      });
      return next;
    });
  }, [userBookings]);

  const bookingInfo = useMemo(() => {
    return mapBookingsForCalendar(userBookings, {
      labName: (booking) => booking?.labDetails?.name || `Lab ${booking?.labId}`
    })
  }, [userBookings]);
  
  // Additional state variables
  const [userData, setUserData] = useState(null);
  const [now, setNow] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLabId, setSelectedLabId] = useState(null);
  
  // Initialize time on client side and update every minute to auto-move bookings from upcoming to past
  useEffect(() => {
    // Set initial time
    setNow(new Date());
    
    // Update time every minute (60000ms) to automatically refresh booking lists
    const intervalId = setInterval(() => {
      setNow(new Date());
      devLog.log('🕐 UserDashboard: Time updated for automatic booking list refresh');
    }, 60000);
    
    // Cleanup interval on unmount
    return () => clearInterval(intervalId);
  }, []);
      
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
      notifyUserDashboardMissingBookingSelection(addTemporaryNotification);
      return;
    }

    // Check if already canceled
    if (booking.status === "5" || booking.status === 5) {
      notifyUserDashboardAlreadyCanceled(addTemporaryNotification);
      return;
    }

    // Require wallet only for wallet path; allow SSO without wallet
    if (!isSSO && !isConnected) {
      notifyUserDashboardWalletRequired(addTemporaryNotification);
      return;
    }

    // Clear any previous cancellation error for this booking
    setFailedCancellations(prev => {
      const newSet = new Set(prev);
      newSet.delete(booking.reservationKey);
      return newSet;
    });
    if (cancellationStates.has(booking.reservationKey)) {
      return;
    }
    if (cancellingKeysRef.current.has(booking.reservationKey)) {
      return;
    }
    cancellingKeysRef.current.add(booking.reservationKey);

    setSelectedBooking(booking);
    const isPending = booking.status === 0 || booking.status === '0';
    setCancellationStage(booking.reservationKey, 'processing');
    notifyUserDashboardCancellationProcessing(
      addTemporaryNotification,
      booking.reservationKey,
      { isRequest: isPending }
    );
    
    try {
      // 🚀 Route by status: pending -> cancel reservation request; booked -> cancel booking
      if (isPending) {
        // Fire transaction but do NOT remove from UI yet; wait for chain event
        await cancelReservationUnified.mutateAsync(booking);
      } else {
        // Fire transaction but do NOT remove from UI yet; wait for chain event
        await cancelBookingUnified.mutateAsync(booking);
      }

      setCancellationStage(booking.reservationKey, 'submitted');
      notifyUserDashboardCancellationSubmitted(
        addTemporaryNotification,
        booking.reservationKey,
        { isRequest: isPending }
      );

      if (typeof registerPendingCancellation === 'function') {
        registerPendingCancellation(
          booking.reservationKey,
          booking.labId,
          address || user?.userid
        );
      }

      // UI removal is handled by BookingEventContext upon on-chain confirmation
      // This prevents premature list updates and avoids full list refreshes

    } catch (error) {
      devLog.error('Cancellation failed:', error);
      cancellingKeysRef.current.delete(booking.reservationKey);
      setCancellationStage(booking.reservationKey, null);
      
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
        notifyUserDashboardCancellationRejected(addTemporaryNotification);
      } else if (
        error?.code === 'INTENT_AUTH_CANCELLED' ||
        error?.name === 'NotAllowedError'
      ) {
        notifyUserDashboardCancellationRejected(addTemporaryNotification);
      } else {
        notifyUserDashboardCancellationFailed(addTemporaryNotification, booking?.reservationKey);
      }
    }
  };

  // 🚀 All transaction handling is now done through React Query mutations
  // Legacy blockchain transaction functions removed

  // Additional utility functions

  // 🚀 React Query handles all transaction management automatically
  // No manual transaction state or confirmation handling needed

  const handleRefund = () => {
    closeModal();
  };

  // Calendar
  const today = new Date();
  const [date, setDate] = useState(new Date());

  // Simulate user data fetching
  useEffect(() => {
    if (isLoggedIn && userBookings?.length > 0) {
      const userid = address || user?.id;
      const affiliation = user?.affiliation || 'Unknown';
      setUserData({
        userid: userid,
        affiliation: affiliation,
        // Remove labs dependency - user data doesn't need full labs list
      });
    }
  }, [isLoggedIn, userBookings?.length, address, user?.id, user?.affiliation]);

  if (!now || (!userData && bookingsLoading)) {
    return (
      <AccessControl message="Please log in to view and make reservations.">
        <Container padding="sm">
          <Stack spacing="lg">
            <DashboardSectionSkeleton />
            <div className="flex md:flex-row flex-col gap-4">
              <div className="md:w-1/2">
                <DashboardSectionSkeleton />
              </div>
              <div className="md:w-1/2">
                <DashboardSectionSkeleton />
              </div>
            </div>
          </Stack>
        </Container>
      </AccessControl>
    )
  }

  if (bookingsLoading) {
    return (
      <AccessControl message="Please log in to view your dashboard.">
        <Container padding="sm">
          <Stack spacing="lg">
            <DashboardSectionSkeleton />
            <div className="flex md:flex-row flex-col gap-4">
              <div className="md:w-1/2">
                <DashboardSectionSkeleton />
              </div>
            <div className="md:w-1/2">
              <DashboardSectionSkeleton />
            </div>
          </div>
          </Stack>
        </Container>
      </AccessControl>
    )
  }

  // ❌ Error handling for React Query
  if (bookingsError) {
    devLog.error('Dashboard booking error:', bookingsErrorDetails);
    
    return (
      <AccessControl message="Please log in to view and make reservations.">
        <Container padding="sm">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
            <h2 className="text-red-800 text-xl font-semibold mb-2">Error Loading Dashboard</h2>
            <p className="text-red-600 mb-4">
              {bookingsError && (bookingsErrorDetails?.message || 'Failed to load booking data')}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </Container>
      </AccessControl>
    );
  }

  return (
    <AccessControl message="Please log in to view and make reservations.">
      <Container padding="sm">
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
            <p className="text-gray-700 wrap-break-word">
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
            
            <div className='flex xl:flex-row flex-col gap-4 mb-6'>
              {/* Active booking section - uses optimized hook */}
              <div className="xl:w-2/3 w-full">
                <ActiveBookingSection 
                  userAddress={isSSO ? null : (user?.userid || address)}
                  options={{
                    enabled: canFetchBookings,
                    staleTime: 5 * 60 * 1000, // 5 minutes
                  }}
                />
              </div>
              
              {/* Right sidebar: Calendar and Summary */}
              <div className="xl:w-1/3 w-full flex flex-col gap-4">
                {/* Calendar section */}
                <div className="w-full">
                  <div className="text-white mb-1 justify-center">
                    <h3 className="text-base font-semibold mb-3 text-center">Calendar</h3>
                    <div className="flex flex-row justify-center">
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

                {/* Booking summary section - uses optimized hook */}
                <div className="w-full">
                  <BookingSummarySection 
                    userAddress={isSSO ? null : (user?.userid || address)}
                    options={{
                      enabled: canFetchBookings,
                      staleTime: 10 * 60 * 1000, // 10 minutes - summary is less dynamic
                    }}
                  />
                </div>
              </div>
            </div>
            {/* Bottom panel: bookings lists */}
            <div className="flex xl:flex-row flex-col gap-4 mt-6">
              {/* Upcoming bookings list */}
              <BookingsList
                bookings={userBookings}
                currentTime={now}
                isLoading={bookingsLoading && userBookings.length === 0}
                type="upcoming"
                onCancel={handleCancellation}
                onClearError={handleClearCancellationError}
                failedCancellations={failedCancellations}
                cancellationStates={cancellationStates}
                closeModal={closeModal}
              />
              
              {/* Vertical divider */}
              <div className="xl:mt-1 xl:mx-3 xl:w-px xl:self-stretch bg-linear-to-tr 
                from-transparent via-neutral-800 to-transparent opacity-90 
                dark:via-neutral-200 border-l border-neutral-800 
                dark:border-neutral-200 border-dashed"
                style={{ borderWidth: '4px', borderLeftStyle: 'dashed' }} />

              {/* Past bookings list */}
              <BookingsList
                bookings={userBookings}
                currentTime={now}
                isLoading={bookingsLoading && userBookings.length === 0}
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
      </Container>
    </AccessControl>
  )
}
