/**
 * Composed React Query Hook for user bookings dashboard
 * Uses useQueries to orchestrate multiple related atomic hooks while maintaining
 * React Query's caching, error handling, and retry capabilities
 * 
 * ARCHITECTURE: Institutional-only.
 * - Uses session-derived institutional endpoints (/api/contract/institution/*)
 * - Reservation details still resolve through the shared read-only reservation API.
 */
import { useQueries } from '@tanstack/react-query'
import { useMemo } from 'react'
import { 
  useReservationsOfSSO,
  useReservationSSO,
  useReservationKeyOfUserByIndexSSO,
  BOOKING_QUERY_CONFIG,
} from './useBookingAtomicQueries'
import { useAllLabsSSO, useLabSSO, useLabOwnerSSO, LAB_QUERY_CONFIG } from '@/hooks/lab/useLabAtomicQueries'
import { useMetadata, METADATA_QUERY_CONFIG } from '@/hooks/metadata/useMetadata'
import { processMetadataImages, processMetadataDocs } from '@/hooks/utils/metadataHelpers'
import { bookingQueryKeys, labQueryKeys, metadataQueryKeys } from '@/utils/hooks/queryKeys'
import {
  calculateBookingSummary,
  getReservationStatusText,
} from '@/utils/booking/dashboardSummary'
import { useProviderMapping } from '@/utils/hooks/useProviderMapping'
import devLog from '@/utils/dev/logger'

/**
 * Composed dashboard hook for getting user bookings with enriched details and comprehensive analytics
 * Uses the authenticated institutional session; `userAddress` remains null in the target runtime.
 * Orchestrates: reservation count → reservation keys → booking details → optional lab details → analytics
 * Provides booking summary analytics, recent activity, and status categorization for dashboard components
 * @param {string|null} userAddress - User wallet address (null for institutional users or auto-detect from context)
 * @param {Object} options - Configuration options
 * @param {boolean} [options.includeLabDetails=false] - Whether to fetch lab details for each booking
 * @param {boolean} [options.includeRecentActivity=false] - Whether to calculate recent activity summary
 * @param {number} [options.limit] - Maximum number of reservations to fetch (unlimited if not specified)
 * @param {Object} [options.queryOptions] - Override options for base booking queries only
 * @returns {Object} React Query result with enriched booking data, analytics summary, and optional recent activity
 */
export const useUserBookingsDashboard = (userAddress, { 
  includeLabDetails = false,
  includeRecentActivity = false,
  limit,
  queryOptions = {} 
} = {}) => {
  const baseQueryOptions = { ...(queryOptions || {}) };
  delete baseQueryOptions.enabled;
  const rawEnabled = queryOptions?.enabled;
  const queryEnabled =
    rawEnabled === undefined
      ? true
      : (typeof rawEnabled === 'function' ? Boolean(rawEnabled()) : Boolean(rawEnabled));
  const baseBookingQueryOptions = { ...BOOKING_QUERY_CONFIG, ...baseQueryOptions };
  const bookingDetailsRetry =
    Object.prototype.hasOwnProperty.call(baseQueryOptions, 'retry')
      ? baseQueryOptions.retry
      : (failureCount, error) => {
          if (error?.message?.includes('404') || 
              error?.message?.includes('not found') ||
              error?.message?.includes('400')) {
            return false;
          }
          return failureCount < 1;
        };
  
  // Step 1: Get user reservation count from the institutional session
  const reservationCountResult = useReservationsOfSSO({
    ...baseBookingQueryOptions,
    enabled: queryEnabled,
  });
  
  // Extract reservation count and apply limit if specified
  const totalReservationCount = reservationCountResult.data?.count || 0;
  const reservationCount = limit ? Math.min(totalReservationCount, limit) : totalReservationCount;
  const hasReservations = reservationCount > 0;

  // DEBUG: Log reservation count details
  devLog.log('Institutional session bookings summary:', {
    totalReservationCount,
    reservationCount,
    limit,
    hasReservations,
    willCreateIndices: hasReservations ? `0 to ${reservationCount - 1}` : 'none'
  });

  // Step 2: Get reservation keys for each institutional-session index
  // SAFETY: Additional validation to prevent out-of-range queries
  const safeReservationCount = Math.max(0, Math.min(reservationCount, 100)); // Cap at 100 for safety

  const reservationKeyResults = useQueries({
    queries: hasReservations && safeReservationCount > 0
      ? Array.from({ length: safeReservationCount }, (_, index) => {
          if (index < 0 || index >= safeReservationCount) {
            return {
              queryKey: ['blocked-query', 'sso', index],
              queryFn: () => Promise.reject(new Error(`Index ${index} out of range`)),
              enabled: false,
              ...BOOKING_QUERY_CONFIG,
            };
          }

          return {
            queryKey: bookingQueryKeys.ssoReservationKeyOfUserByIndex(index),
            queryFn: () => useReservationKeyOfUserByIndexSSO.queryFn(index),
            enabled: queryEnabled && hasReservations && index >= 0 && index < safeReservationCount,
            ...baseBookingQueryOptions,
          };
        })
      : [],
    combine: (results) => results
  });

  // Extract reservation keys from successful results
  const reservationKeys = reservationKeyResults
    .filter(result => result.isSuccess && result.data)
    .map(result => result.data.reservationKey || result.data);

  devLog.log('🔑 [useUserBookingsDashboard] reservationKeys sample:', {
    total: reservationKeys.length,
    sample: reservationKeys.slice(0, 10),
  });

  // Step 3: Get booking details for each reservation key
  // Shared read-only reservation endpoint for institutional bookings
  const bookingDetailsResults = useQueries({
    queries: reservationKeys.length > 0 
      ? reservationKeys.map(key => ({
          queryKey: bookingQueryKeys.byReservationKey(key),
          queryFn: () => useReservationSSO.queryFn(key),
          enabled: queryEnabled && !!key,
          ...baseBookingQueryOptions,
          retry: bookingDetailsRetry,
        }))
      : [],
    combine: (results) => results
  });

  // Extract raw booking API payloads
  const rawBookingPayloads = bookingDetailsResults
    .filter(result => {
      // Filter out failed queries and non-existent reservations
      if (!result.isSuccess || !result.data) return false;
      
      // Filter out reservations marked as notFound by the API
      if (result.data.notFound === true) {
        devLog.warn('🚫 Filtering out non-existent reservation:', result.data.reservationKey);
        return false;
      }
      
      // Filter out reservations with no renter (doesn't exist on-chain)
      if (result.data.reservation?.exists === false) {
        devLog.warn('🚫 Filtering out reservation with no renter:', result.data.reservationKey);
        return false;
      }
      
      return true;
    })
    .map(result => {
      const data = result.data;
      // Ensure we have reservationKey in the payload
      return {
        ...data,
        reservationKey: data.reservationKey || reservationKeys[bookingDetailsResults.indexOf(result)]
      };
    });

  // Normalize bookings to flat shape expected by UI (calendar, lists)
  const now = Math.floor(Date.now() / 1000);

  const bookings = rawBookingPayloads.map(payload => {
    // API returns { reservation: {...}, reservationKey }
    const r = payload?.reservation || {};
    // Keep labId as string to match labs.id shape
    const labId = r.labId != null ? r.labId.toString() : undefined;
    const startTime = r.start != null ? parseInt(r.start) : undefined;
    const endTime = r.end != null ? parseInt(r.end) : undefined;
    const statusNumeric = r.status;
    const price = r.price != null ? r.price.toString() : null;
    const payerInstitution = r.payerInstitution || null;
    const collectorInstitution = r.collectorInstitution || null;

    // Derive status category for analytics/filters (keep numeric status for business rules)
    let statusCategory = 'unknown';
    const numericStatus = parseInt(statusNumeric);
    
    if (numericStatus === 5 || statusNumeric === '5') {
      statusCategory = 'cancelled';
    } else if (numericStatus === 0 || statusNumeric === '0') {
      if (endTime && now > endTime) {
        statusCategory = 'expired';
      } else {
        statusCategory = 'pending';
      }
    } else if (numericStatus === 2 || numericStatus === 3 || numericStatus === 4) {
      statusCategory = 'completed';  // USED, COMPLETED, or COLLECTED
    } else if (numericStatus === 1) {
      // CONFIRMED/BOOKED - use timing logic
      if (startTime && endTime) {
        if (now < startTime) statusCategory = 'upcoming';
        else if (now >= startTime && now <= endTime) statusCategory = 'active';
        else statusCategory = 'completed';
      } else {
        statusCategory = 'upcoming';  // No timing, assume upcoming
      }
    } else if (startTime && endTime) {
      // Unknown status - fallback to temporal logic
      if (now < startTime) statusCategory = 'upcoming';
      else if (now >= startTime && now <= endTime) statusCategory = 'active';
      else statusCategory = 'completed';
    }

    // Calendar/list friendly flat object
  const flat = {
      id: payload.reservationKey || undefined,
      reservationKey: payload.reservationKey,
      labId,
      status: statusNumeric, // keep numeric/string code (0,1,2,3,4,5)
      price,
      payerInstitution,
      collectorInstitution,
      statusCategory,
      start: startTime,
      end: endTime,
      // date as ISO string (yyyy-mm-dd or full ISO ok; consumers parse via new Date())
      date: startTime ? new Date(startTime * 1000).toISOString() : null,
    };

    return flat;
  });

  // For lab details fetching we need labIds - Use SSO variant per architecture
  const allLabsResult = useAllLabsSSO({ enabled: includeLabDetails && (queryOptions.enabled ?? true) });
  const allLabIds = allLabsResult.data || [];
  const labIdSet = useMemo(() => new Set(allLabIds.map(id => String(id))), [allLabIds]);

  const bookingsWithLabIds = bookings.filter(booking => {
    if (booking.labId === undefined || booking.labId === null) return false;
    if (labIdSet.size === 0) return true;
    return labIdSet.has(String(booking.labId));
  });

  // Step 5: Get lab details for each booking if requested
  const labDetailsResults = useQueries({
    queries: (includeLabDetails && bookingsWithLabIds.length > 0) 
      ? bookingsWithLabIds.map(booking => ({
          queryKey: labQueryKeys.getLab(booking.labId),
          queryFn: () => useLabSSO.queryFn(booking.labId), // ✅ Using atomic hook queryFn
          enabled: !!booking.labId,
          ...LAB_QUERY_CONFIG, // ✅ Lab-specific configuration
          // Note: queryOptions not spread here as LAB_QUERY_CONFIG is optimized for lab data
        }))
      : [],
    combine: (results) => results
  });

  // Step 5: Get lab metadata for enriched lab details (if lab details are included)
  const labMetadataResults = useQueries({
    queries: (includeLabDetails && labDetailsResults.length > 0) 
      ? labDetailsResults.map((labResult, index) => {
          const labData = labResult?.data;
          const metadataUri = labData?.base?.uri;
          return {
            queryKey: metadataQueryKeys.byUri(metadataUri || 'placeholder'),
            queryFn: () => useMetadata.queryFn(metadataUri), // ✅ Using atomic hook queryFn
            enabled: !!metadataUri,
            ...METADATA_QUERY_CONFIG, // ✅ Using shared configuration
          };
        })
      : [],
    combine: (results) => results
  });

  // Step 6: Get lab owners for provider mapping (if lab details are included)
  const labOwnerResults = useQueries({
    queries: (includeLabDetails && bookingsWithLabIds.length > 0) 
      ? bookingsWithLabIds.map(booking => ({
          queryKey: labQueryKeys.ownerOf(booking.labId),
          queryFn: () => useLabOwnerSSO.queryFn(booking.labId), // ✅ Using atomic hook queryFn
          enabled: !!booking.labId,
          ...LAB_QUERY_CONFIG, // ✅ Lab-specific configuration
        }))
      : [],
    combine: (results) => results
  });

  // Step 7: Provider mapping utility hook
  const providerMapping = useProviderMapping({
    enabled: includeLabDetails // Only fetch when lab details are needed
  });

  // Process and combine all results
  // Only block UI if the initial reservation count is loading
  // Allow partial rendering if some individual bookings are still loading
  const isLoading = reservationCountResult.isLoading ||
                   (reservationCountResult.isSuccess && reservationCount > 0 && bookingDetailsResults.length === 0 && reservationKeyResults.some(result => result.isLoading));
  
  // Track if we're loading additional details (don't block UI for this)
  const isLoadingDetails = (includeLabDetails && labDetailsResults.some(result => result.isLoading)) ||
                          (includeLabDetails && labMetadataResults.some(result => result.isLoading)) ||
                          (includeLabDetails && labOwnerResults.some(result => result.isLoading)) ||
                          (includeLabDetails && providerMapping.isLoading);

  const baseErrors = reservationCountResult.error ? [reservationCountResult.error] : [];
  const keyErrors = reservationKeyResults.filter(result => result.error)
                                         .map(result => result.error);
  const bookingErrors = bookingDetailsResults.filter(result => result.error)
                                            .map(result => result.error);
  const labErrors = labDetailsResults.filter(result => result.error)
                                    .map(result => result.error);
  const metadataErrors = labMetadataResults.filter(result => result.error)
                                          .map(result => result.error);
  const ownerErrors = labOwnerResults.filter(result => result.error)
                                    .map(result => result.error);
  const providerErrors = providerMapping.error ? [providerMapping.error] : [];
  
  const hasErrors = baseErrors.length > 0;
  const hasPartialErrors = keyErrors.length > 0 || bookingErrors.length > 0 || labErrors.length > 0 || metadataErrors.length > 0 || ownerErrors.length > 0 || providerErrors.length > 0;

  // Enrich with optional lab details (keep flat shape)
  const enrichedBookings = bookings.map((booking) => {
    if (includeLabDetails && booking.labId) {
      const matchingLabIndex = bookingsWithLabIds.findIndex(b => 
        b.labId === booking.labId && b.reservationKey === booking.reservationKey
      );
      
      if (matchingLabIndex >= 0 && labDetailsResults[matchingLabIndex]?.data) {
        const labData = labDetailsResults[matchingLabIndex].data;
        const metadataData = labMetadataResults[matchingLabIndex]?.data;
        const ownerData = labOwnerResults[matchingLabIndex]?.data;
        
        // Combine lab data with metadata for enriched experience
        const enrichedLabDetails = {
          ...labData,
          // Provider auth URI is stored at provider level (resolved below if available)
          authURI: labData?.authURI || '',
          // Add metadata fields if available
          name: metadataData?.name || labData?.name || `Lab ${booking.labId}`,
          description: metadataData?.description || labData?.description,
          image: metadataData?.image || labData?.image,
          category: metadataData?.category || labData?.category,
          keywords: metadataData?.keywords || labData?.keywords,
          // Add owner from ownerOf query  
          owner: ownerData?.owner,
          // Process attributes to extract images and docs
          images: processMetadataImages(metadataData),
          docs: processMetadataDocs(metadataData)
        };

        // Debug full lab data structure to understand owner field
        devLog.log('🔬 Full lab data structure:', {
          labData: labData,
          labDataKeys: Object.keys(labData || {}),
          ownerData: ownerData,
          enrichedOwner: enrichedLabDetails.owner
        });

        // Add provider name mapping using utility hook
        const labOwner = enrichedLabDetails.owner;
        const providerInfo = providerMapping.mapOwnerToProvider(labOwner);
        
        if (providerInfo) {
          enrichedLabDetails.providerName = providerInfo.name;
          enrichedLabDetails.providerInfo = providerInfo;
          if (providerInfo.authURI) {
            enrichedLabDetails.authURI = providerInfo.authURI;
            enrichedLabDetails.auth = providerInfo.authURI;
          }
        }
        
        // ✅ Create a properly formatted lab object for components
        const formattedLab = {
          id: booking.labId, // ✅ Always use labId from booking for consistency
          name: enrichedLabDetails.name,
          provider: enrichedLabDetails.providerName || enrichedLabDetails.provider || 'Unknown Provider',
          // ✅ Preserve enriched metadata fields for Carrousel and DocsCarrousel
          images: enrichedLabDetails.images || [], // For Carrousel component
          docs: enrichedLabDetails.docs || [], // For DocsCarrousel component  
          image: enrichedLabDetails.image, // Main image
          description: enrichedLabDetails.description,
          category: enrichedLabDetails.category,
          keywords: enrichedLabDetails.keywords,
          auth: enrichedLabDetails.auth || enrichedLabDetails.authURI || '',
          // Pass through all other enriched lab details
          ...enrichedLabDetails
        };

        // Debug log for formatted lab data
        devLog.log('🖼️ FormattedLab for ActiveLabCard:', {
          labId: booking.labId,
          formattedImages: formattedLab.images,
          formattedDocs: formattedLab.docs,
          enrichedImages: enrichedLabDetails.images,
          enrichedDocs: enrichedLabDetails.docs,
          metadataData: metadataData,
          metadataAttributes: metadataData?.attributes,
          processedImages: processMetadataImages(metadataData),
          processedDocs: processMetadataDocs(metadataData)
        });

        return { ...booking, labDetails: formattedLab };
      }
    }
    return booking;
  });

  // Debug lab ids flowing into dashboard (first few only)
  devLog.log('🧪 [useUserBookingsDashboard] booking labIds sample:', {
    count: bookings.length,
    sample: bookings.slice(0, 5).map((b) => b.labId)
  });

  // Calculate aggregates using utility function
  const aggregates = calculateBookingSummary(enrichedBookings);

  // Calculate recent activity if requested (optional feature)
  const recentActivity = useMemo(() => {
    if (!includeRecentActivity || !enrichedBookings.length) {
      return [];
    }

    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60);
    const activities = [];

    enrichedBookings.forEach(booking => {
      const start = booking.start || booking.startTime;
      const end = booking.end || booking.endTime;
      const status = parseInt(booking.status) || 0;

      // Skip bookings with invalid timestamps
      if (!start || !end || isNaN(start) || isNaN(end) || start <= 0 || end <= 0) {
        return;
      }

      // Add to recent activity (for recent 30 days)
      if (start > thirtyDaysAgo) {
        let action = 'Unknown';
        if (status === 5) action = 'Cancelled';
        else if (status === 4 || status === 3) action = 'Completed';
        else if ((status === 1 || status === 2) && start <= now && now <= end) action = 'Active';
        else if ((status === 1 || status === 2) && start > now) action = 'Upcoming';
        else if (status === 0) action = 'Pending';

        // Safely format date
        try {
          const date = new Date(start * 1000);
          const formattedDate = isNaN(date.getTime()) ? 'Invalid Date' : date.toLocaleDateString();
          
          activities.push({
            action,
            labId: booking.labId,
            date: formattedDate,
            status: getReservationStatusText(status)
          });
        } catch (error) {
          devLog.warn('⚠️ Error formatting date for activity:', error);
        }
      }
    });

    return activities.slice(0, 5); // Keep only top 5
  }, [includeRecentActivity, enrichedBookings]);

  // Create summary object with analytics and optional recent activity
  const summary = useMemo(() => {
    const result = {
      ...aggregates,
      totalBookings: totalReservationCount, // Use total count, not limited count
      ...(includeRecentActivity && { recentActivity })
    };

    devLog.log('📊 useUserBookingsDashboard - Summary calculated:', {
      result,
      includeRecentActivity,
      totalReservationCount,
      limitedCount: reservationCount
    });

    return result;
  }, [aggregates, totalReservationCount, includeRecentActivity, recentActivity, reservationCount]);

  return {
    // Data
    data: {
      reservationKeys,
      bookings: enrichedBookings,
      // Include individual analytics for backward compatibility
      ...aggregates,
      // Include summary object with analytics and optional recent activity
      summary,
      // Include metadata for complete compatibility
      total: totalReservationCount,
      fetched: enrichedBookings.length,
      userAddress,
    },
    
    // Status
    isLoading,
    isLoadingDetails, // Track loading state of additional details separately
    isSuccess: !hasErrors && reservationCountResult.isSuccess,
    isError: hasErrors,
    error: baseErrors[0] || null,
    
    // Meta information
    meta: {
      userAddress,
      includeLabDetails,
      reservationCount,
      totalRequested: reservationKeys.length,
      successCount: bookingDetailsResults.filter(r => r.isSuccess).length,
      failedCount: bookingDetailsResults.filter(r => r.error).length,
      hasPartialFailures: hasPartialErrors,
      errors: [...baseErrors, ...keyErrors, ...bookingErrors, ...labErrors, ...metadataErrors, ...ownerErrors],
      timestamp: new Date().toISOString()
    },

    // Individual result access
    baseResult: reservationCountResult,
    reservationKeyResults,
    bookingDetailsResults,
    labDetailsResults,

    // Utility functions
    refetch: () => {
      reservationCountResult.refetch();
      reservationKeyResults.forEach(result => result.refetch && result.refetch());
      bookingDetailsResults.forEach(result => result.refetch && result.refetch());
      labDetailsResults.forEach(result => result.refetch && result.refetch());
      labMetadataResults.forEach(result => result.refetch && result.refetch());
      labOwnerResults.forEach(result => result.refetch && result.refetch());
      if (includeLabDetails) providerMapping.providersResult?.refetch();
    }
  };
};
