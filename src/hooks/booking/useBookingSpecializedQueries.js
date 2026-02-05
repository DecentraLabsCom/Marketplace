/**
 * Specialized Booking Hooks - Optimized for specific use cases
 * These hooks use API-only queryFns and derived data for performance
 * 
 * ARCHITECTURE: These hooks use API-based queryFn for BOTH SSO and Wallet users.
 * - SSO: Uses PUC-based endpoints
 * - Wallet: Uses address-based endpoints
 */
import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { 
  useReservationsOfSSO,
  useReservationsOfWallet,
  useReservationKeyOfUserByIndexSSO,
  useReservationKeyOfUserByIndexWallet,
  useReservationSSO,
  BOOKING_QUERY_CONFIG 
} from './useBookingAtomicQueries'
import { useGetIsSSO } from '@/utils/hooks/authMode'
import { bookingQueryKeys } from '@/utils/hooks/queryKeys'
import devLog from '@/utils/dev/logger'

const EMPTY_ARRAY = [];

/**
 * Specialized hook for Market component
 * Uses composed queries to get user reservations and extract active/upcoming lab IDs
 * Works for both SSO and Wallet users
 * @param {string} userAddress - User wallet address (used for wallet users, ignored for SSO)
 * @param {Object} options - Configuration options
 * @returns {Object} React Query result with minimal booking data for market filtering
 */
export const useUserBookingsForMarket = (userAddress, options = {}) => {
  const resolvedOptions = { ...(options.queryOptions || {}), ...options };
  const isSSO = useGetIsSSO(resolvedOptions);
  
  // Step 1: Get user reservation count (using appropriate hook based on user type)
  const ssoCountResult = useQuery({
    queryKey: bookingQueryKeys.ssoReservationsOf(),
    queryFn: () => useReservationsOfSSO.queryFn(),
    enabled: isSSO && (options.enabled !== false),
    ...BOOKING_QUERY_CONFIG,
  });
  
  const walletCountResult = useQuery({
    queryKey: bookingQueryKeys.reservationsOf(userAddress),
    queryFn: () => useReservationsOfWallet.queryFn(userAddress),
    enabled: !isSSO && !!userAddress && (options.enabled !== false),
    ...BOOKING_QUERY_CONFIG,
  });
  
  const reservationCountResult = isSSO ? ssoCountResult : walletCountResult;

  const totalReservationCount = reservationCountResult.data?.count || 0;
  const hasReservations = totalReservationCount > 0;

  // Step 2: Get reservation keys for each index
  const reservationKeyResults = useQueries({
    queries: hasReservations 
      ? Array.from({ length: Math.min(totalReservationCount, 50) }, (_, index) => {
        if (isSSO) {
          return {
            queryKey: bookingQueryKeys.ssoReservationKeyOfUserByIndex(index),
            queryFn: () => useReservationKeyOfUserByIndexSSO.queryFn(index),
            enabled: hasReservations,
            ...BOOKING_QUERY_CONFIG,
          };
        } else {
            return {
              queryKey: bookingQueryKeys.reservationKeyOfUserByIndex(userAddress, index),
              queryFn: () => useReservationKeyOfUserByIndexWallet.queryFn(userAddress, index),
              enabled: !!userAddress && hasReservations,
              ...BOOKING_QUERY_CONFIG,
            };
          }
        })
      : [],
    combine: (results) => results
  });

  const reservationKeys = reservationKeyResults
    .filter(result => result.isSuccess && result.data)
    .map(result => result.data.reservationKey || result.data);

  // Step 3: Get reservation details
  const bookingDetailsResults = useQueries({
    queries: reservationKeys.length > 0
      ? reservationKeys.map(key => ({
          queryKey: bookingQueryKeys.byReservationKey(key),
          queryFn: () => useReservationSSO.queryFn(key),
          enabled: !!key,
          ...BOOKING_QUERY_CONFIG,
        }))
      : [],
    combine: (results) => results
  });

  // Step 4: Process reservations to extract ONLY ACTIVE lab IDs (not upcoming)
  const now = Math.floor(Date.now() / 1000);
  const userLabsWithActiveBookings = new Set();
  let activeBookingsCount = 0;

  bookingDetailsResults.forEach(result => {
    if (!result.isSuccess || !result.data?.reservation) return;

    const r = result.data.reservation;
    const start = parseInt(r.start);
    const end = parseInt(r.end);
    const status = parseInt(r.status);
    const labId = r.labId != null ? String(r.labId) : undefined;

    if (!labId) return;

    // Skip cancelled bookings
    if (status === 5) return;

    if (start <= now && now <= end && (status === 1 || status === 2)) {
      // Add active bookings to Set
      userLabsWithActiveBookings.add(labId);
      activeBookingsCount++;
    }
  });

  // Determine loading state
  const isLoading = reservationCountResult.isLoading || 
                    reservationKeyResults.some(r => r.isLoading) ||
                    bookingDetailsResults.some(r => r.isLoading);

  const isFetching = reservationCountResult.isFetching || 
                     reservationKeyResults.some(r => r.isFetching) ||
                     bookingDetailsResults.some(r => r.isFetching);

  return {
    data: {
      userLabsWithActiveBookings,
      activeBookingsCount,
      hasBookingInLab: (labId) => {
        if (!labId && labId !== 0) return false;
        const labIdStr = String(labId);
        const hasBooking = userLabsWithActiveBookings.has(labIdStr);       
        return hasBooking;
      }
    },
    isLoading,
    isFetching,
    isSuccess: !isLoading && reservationCountResult.isSuccess
  };
};

const normalizeReservation = (payload, fallbackKey) => {
  const reservation = payload?.reservation;
  if (!reservation) return null;
  if (payload?.notFound === true) return null;
  if (reservation?.exists === false) return null;

  const reservationKey = payload?.reservationKey || fallbackKey;
  const labId = reservation.labId != null ? String(reservation.labId) : undefined;
  const start = reservation.start != null ? parseInt(reservation.start) : null;
  const end = reservation.end != null ? parseInt(reservation.end) : null;

  return {
    id: reservationKey,
    reservationKey,
    labId,
    status: reservation.status,
    start,
    end,
    date: start ? new Date(start * 1000).toLocaleDateString('en-CA') : null,
  };
};

const useUserReservationDetails = (userAddress, options = {}) => {
  const isSSO = useGetIsSSO(options);
  const queryEnabled = (options.enabled !== false) && (options.queryOptions?.enabled !== false);
  const baseQueryOptions = { ...(options.queryOptions || {}) };
  delete baseQueryOptions.enabled;
  const queryOptions = { ...BOOKING_QUERY_CONFIG, ...baseQueryOptions };

  const ssoCountResult = useQuery({
    queryKey: bookingQueryKeys.ssoReservationsOf(),
    queryFn: () => useReservationsOfSSO.queryFn(),
    enabled: isSSO && queryEnabled,
    ...queryOptions,
  });

  const walletCountResult = useQuery({
    queryKey: bookingQueryKeys.reservationsOf(userAddress),
    queryFn: () => useReservationsOfWallet.queryFn(userAddress),
    enabled: !isSSO && !!userAddress && queryEnabled,
    ...queryOptions,
  });

  const reservationCountResult = isSSO ? ssoCountResult : walletCountResult;
  const totalReservationCount = reservationCountResult.data?.count || 0;
  const limitedCount = options.limit ? Math.min(totalReservationCount, options.limit) : totalReservationCount;
  const safeReservationCount = Math.max(0, Math.min(limitedCount, 100));

  const reservationKeyResults = useQueries({
    queries: safeReservationCount > 0
      ? Array.from({ length: safeReservationCount }, (_, index) => {
          if (isSSO) {
            return {
              queryKey: bookingQueryKeys.ssoReservationKeyOfUserByIndex(index),
              queryFn: () => useReservationKeyOfUserByIndexSSO.queryFn(index),
              enabled: queryEnabled,
              ...queryOptions,
            };
          }
          return {
            queryKey: bookingQueryKeys.reservationKeyOfUserByIndex(userAddress, index),
            queryFn: () => useReservationKeyOfUserByIndexWallet.queryFn(userAddress, index),
            enabled: queryEnabled && !!userAddress,
            ...queryOptions,
          };
        })
      : [],
    combine: (results) => results
  });

  const reservationKeys = reservationKeyResults
    .filter(result => result.isSuccess && result.data)
    .map(result => result.data.reservationKey || result.data);

  const bookingDetailsResults = useQueries({
    queries: reservationKeys.length > 0
      ? reservationKeys.map(key => ({
          queryKey: bookingQueryKeys.byReservationKey(key),
          queryFn: () => useReservationSSO.queryFn(key),
          enabled: queryEnabled && !!key,
          ...queryOptions,
        }))
      : [],
    combine: (results) => results
  });

  const reservations = bookingDetailsResults
    .filter(result => result.isSuccess && result.data)
    .map((result, index) => normalizeReservation(result.data, reservationKeys[index]))
    .filter(Boolean);

  const isLoading = reservationCountResult.isLoading ||
    reservationKeyResults.some(r => r.isLoading) ||
    bookingDetailsResults.some(r => r.isLoading);

  const isFetching = reservationCountResult.isFetching ||
    reservationKeyResults.some(r => r.isFetching) ||
    bookingDetailsResults.some(r => r.isFetching);

  return {
    data: reservations,
    isLoading,
    isFetching,
    isSuccess: !isLoading && reservationCountResult.isSuccess,
    isError: reservationCountResult.isError || false,
    error: reservationCountResult.error || null,
    refetch: () => {
      reservationCountResult.refetch?.();
      reservationKeyResults.forEach(result => result.refetch && result.refetch());
      bookingDetailsResults.forEach(result => result.refetch && result.refetch());
    }
  };
};

/**
 * Specialized hook for calendar availability checking
 * Uses API-only reservation pipeline for user bookings
 * @param {string} userAddress - User wallet address  
 * @param {string|number} labId - Lab ID for lab-specific bookings (not used in this version)
 * @param {Object} options - Configuration options
 * @returns {Object} User booking data for calendar slot validation
 */
export const useBookingsForCalendar = (userAddress, labId, options = {}) => {
  const reservationsQuery = useUserReservationDetails(userAddress, options);
  const rawReservations = reservationsQuery.data || EMPTY_ARRAY;

  devLog.log('[useBookingsForCalendar] Processing reservations:', {
    userAddress,
    labId,
    reservationCount: rawReservations.length
  });

  const calendarBookings = useMemo(() => {
    if (rawReservations.length === 0) {
      return EMPTY_ARRAY;
    }

    return rawReservations
      .filter(reservation => parseInt(reservation.status) !== 5)
      .map(reservation => ({
        id: reservation.reservationKey,
        labId: reservation.labId,
        start: reservation.start,
        end: reservation.end,
        status: reservation.status,
        date: reservation.date || (reservation.start ? new Date(parseInt(reservation.start) * 1000).toLocaleDateString('en-CA') : null),
        type: 'user'
      }));
  }, [rawReservations]);

  devLog.log('[useBookingsForCalendar] Result:', {
    totalBookings: calendarBookings.length,
    labIds: [...new Set(calendarBookings.map(b => b.labId))]
  });

  return {
    ...reservationsQuery,
    data: {
      userBookings: calendarBookings,
      totalUserBookings: calendarBookings.length
    }
  };
};

/**
 * Hook for getting only active user bookings (for dashboard "active now" section)
 * More efficient than full dashboard data when you only need current active booking
 * @param {string} userAddress - User wallet address
 * @param {Object} options - Configuration options  
 * @returns {Object} Active booking data - NOTE: lab details need to be fetched separately
 */
export const useActiveUserBooking = (userAddress, options = {}) => {
  const reservationsQuery = useUserReservationDetails(userAddress, options);
  const rawReservations = reservationsQuery.data || EMPTY_ARRAY;

  devLog.log('[useActiveUserBooking] Processing reservations:', {
    userAddress,
    reservationCount: rawReservations.length
  });

  const { activeBooking, nextBooking } = useMemo(() => {
    if (rawReservations.length === 0) {
      return { activeBooking: null, nextBooking: null };
    }

    const now = Math.floor(Date.now() / 1000);
    const active = rawReservations.find(reservation => {
      const start = parseInt(reservation.start);
      const end = parseInt(reservation.end);
      const status = parseInt(reservation.status);
      return status === 1 && start <= now && end >= now;
    }) || null;

    if (active) {
      return { activeBooking: active, nextBooking: null };
    }

    const next = rawReservations
      .filter(reservation => {
        const start = parseInt(reservation.start);
        const status = parseInt(reservation.status);
        return (status === 0 || status === 1) && start > now;
      })
      .sort((a, b) => parseInt(a.start) - parseInt(b.start))[0] || null;

    return { activeBooking: null, nextBooking: next };
  }, [rawReservations]);

  devLog.log('[useActiveUserBooking] Result:', {
    hasActiveBooking: !!activeBooking,
    hasUpcomingBooking: !!nextBooking,
    activeLabId: activeBooking?.labId,
    nextLabId: nextBooking?.labId
  });

  return {
    ...reservationsQuery,
    data: {
      activeBooking,
      nextBooking,
      hasActiveBooking: !!activeBooking,
      hasUpcomingBooking: !!nextBooking
    }
  };
};

/**
 * Specialized hook for BookingSummarySection
 * Gets only booking analytics without lab details or individual bookings
 * Optimized for dashboard summary cards
 * @param {string} userAddress - User wallet address
 * @param {Object} options - Configuration options
 * @returns {Object} Booking analytics summary only
 */
export const useUserBookingSummary = (userAddress, options = {}) => {
  const reservationsQuery = useUserReservationDetails(userAddress, options);
  const rawReservations = reservationsQuery.data || EMPTY_ARRAY;

  const summary = useMemo(() => {
    if (rawReservations.length === 0) {
      return {
        totalBookings: 0,
        activeBookings: 0,
        upcomingBookings: 0,
        completedBookings: 0,
        cancelledBookings: 0,
        pendingBookings: 0
      };
    }

    const now = Math.floor(Date.now() / 1000);
    const computed = {
      totalBookings: rawReservations.length,
      activeBookings: 0,
      upcomingBookings: 0,
      completedBookings: 0,
      cancelledBookings: 0,
      pendingBookings: 0
    };

    rawReservations.forEach(reservation => {
      const start = parseInt(reservation.start);
      const end = parseInt(reservation.end);
      const status = parseInt(reservation.status);
      
      if (status === 5) {
        computed.cancelledBookings++;
      } else if (status === 0) {
        computed.pendingBookings++;
      } else if (status === 3 || status === 4) {
        computed.completedBookings++;
      } else if (status === 2) {
        if (start && end) {
          if (now >= start && now <= end) {
            computed.activeBookings++;
          } else if (now < start) {
            computed.upcomingBookings++;
          } else {
            computed.completedBookings++;
          }
        } else {
          computed.activeBookings++;
        }
      } else if (status === 1) {
        if (start && end) {
          if (now >= start && now <= end) {
            computed.activeBookings++;
          } else if (now < start) {
            computed.upcomingBookings++;
          } else {
            computed.completedBookings++;
          }
        } else {
          computed.upcomingBookings++;
        }
      }
    });

    return computed;
  }, [rawReservations]);

  devLog.log('[useUserBookingSummary] Analytics only:', summary);

  return {
    ...reservationsQuery,
    data: summary
  };
};

/**
 * Specialized hook for ActiveBookingSection
 * Gets current active and next upcoming booking with minimal lab enrichment
 * @param {string} userAddress - User wallet address
 * @param {Object} options - Configuration options
 * @returns {Object} Active and next booking with basic lab data
 */
export const useUserActiveBookings = (userAddress, options = {}) => {
  const reservationsQuery = useUserReservationDetails(userAddress, options);
  const rawReservations = reservationsQuery.data || EMPTY_ARRAY;

  const { activeBooking, nextBooking } = useMemo(() => {
    if (rawReservations.length === 0) {
      return { activeBooking: null, nextBooking: null };
    }

    const now = Math.floor(Date.now() / 1000);
    const activeReservation = rawReservations.find(reservation => {
      const start = parseInt(reservation.start);
      const end = parseInt(reservation.end);
      const status = parseInt(reservation.status);
      return status === 1 && start <= now && end >= now;
    });

    if (activeReservation) {
      return {
        activeBooking: {
          id: activeReservation.reservationKey,
          reservationKey: activeReservation.reservationKey,
          labId: activeReservation.labId,
          status: activeReservation.status,
          start: activeReservation.start,
          end: activeReservation.end,
          date: activeReservation.start ? new Date(parseInt(activeReservation.start) * 1000).toLocaleDateString('en-CA') : null
        },
        nextBooking: null
      };
    }

    const upcomingReservations = rawReservations
      .filter(reservation => {
        const start = parseInt(reservation.start);
        const status = parseInt(reservation.status);
        return (status === 0 || status === 1) && start > now;
      })
      .sort((a, b) => parseInt(a.start) - parseInt(b.start));

    if (upcomingReservations.length > 0) {
      const nextReservation = upcomingReservations[0];
      return {
        activeBooking: null,
        nextBooking: {
          id: nextReservation.reservationKey,
          reservationKey: nextReservation.reservationKey,
          labId: nextReservation.labId,
          status: nextReservation.status,
          start: nextReservation.start,
          end: nextReservation.end,
          date: nextReservation.start ? new Date(parseInt(nextReservation.start) * 1000).toLocaleDateString('en-CA') : null
        }
      };
    }

    return { activeBooking: null, nextBooking: null };
  }, [rawReservations]);

  devLog.log('[useUserActiveBookings] Active/Next only:', {
    hasActive: !!activeBooking,
    hasNext: !!nextBooking,
    activeLabId: activeBooking?.labId,
    nextLabId: nextBooking?.labId
  });

  return {
    ...reservationsQuery,
    data: {
      activeBooking,
      nextBooking,
      hasActiveBooking: !!activeBooking
    }
  };
};

// Module loaded confirmation
devLog.moduleLoaded('✅ Booking specialized hooks loaded');
