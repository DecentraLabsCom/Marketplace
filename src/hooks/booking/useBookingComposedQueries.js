/**
 * Composed React Query Hooks for Booking/Reservation-related operations
 * These hooks use useQueries to orchestrate multiple related atomic hooks while maintaining
 * React Query's caching, error handling, and retry capabilities
 * 
 * ARCHITECTURE: These composed hooks use API-based queryFn for BOTH SSO and Wallet users.
 * - SSO: Uses PUC-based endpoints (/api/contract/institution/*)
 * - Wallet: Uses address-based endpoints (/api/contract/reservation/*)
 * This is necessary because useQueries cannot extract Wagmi hooks as queryFn.
 * 
 * Main hooks:
 * - useUserBookingsDashboard: User bookings with enriched details, analytics, and optional features for user dashboard
 * - useLabBookingsDashboard: Lab bookings with enriched details and analytics for provider dashboard  
 */
import { useQueries, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { 
  useReservationsOfSSO,
  useReservationsOfWallet,
  useReservationSSO,
  useReservationsOfToken,
  useReservationOfTokenByIndexSSO,
  useReservationKeyOfUserByIndexSSO,
  useReservationKeyOfUserByIndexWallet,
  useReservationKeyOfUserByIndex,
  useReservation,
  BOOKING_QUERY_CONFIG, // ✅ Import shared configuration
} from './useBookingAtomicQueries'
import { useAllLabs, useLabSSO, useLabOwnerSSO, useLab, LAB_QUERY_CONFIG } from '@/hooks/lab/useLabAtomicQueries' // ✅ Import lab SSO hooks for useQueries
import { useMetadata, METADATA_QUERY_CONFIG } from '@/hooks/metadata/useMetadata' // ✅ Import metadata hooks
import { useGetIsSSO } from '@/utils/hooks/getIsSSO'
import { bookingQueryKeys, labQueryKeys, metadataQueryKeys } from '@/utils/hooks/queryKeys'
import { useProviderMapping } from '@/utils/hooks/useProviderMapping'
import devLog from '@/utils/dev/logger'

/**
 * Helper function to extract images from metadata attributes
 * @param {Object} metadataData - Metadata object from API
 * @returns {Array} Array of image URLs
 */
const processMetadataImages = (metadataData) => {
  if (!metadataData?.attributes) return [];
  
  const imagesAttribute = metadataData.attributes.find(
    attr => attr.trait_type === 'additionalImages'
  );
  
  const images = imagesAttribute?.value || [];
  
  // Add main image if it exists and not already in images array
  if (metadataData.image && !images.includes(metadataData.image)) {
    images.unshift(metadataData.image);
  }
  
  return Array.isArray(images) ? images : [];
};

/**
 * Helper function to extract docs from metadata attributes
 * @param {Object} metadataData - Metadata object from API
 * @returns {Array} Array of document URLs
 */
const processMetadataDocs = (metadataData) => {
  if (!metadataData?.attributes) return [];
  
  const docsAttribute = metadataData.attributes.find(
    attr => attr.trait_type === 'docs'
  );
  
  const docs = docsAttribute?.value || [];
  return Array.isArray(docs) ? docs : [];
};

/**
 * Helper function to calculate booking summary analytics
 * @param {Array} bookings - Array of booking objects
 * @param {Object} options - Configuration options
 * @param {boolean} [options.includeUpcoming=true] - Whether to include upcoming bookings in summary
 * @param {boolean} [options.includeCancelled=true] - Whether to include cancelled bookings in summary
 * @returns {Object} Summary object with booking counts
 */
const calculateBookingSummary = (bookings = [], options = {}) => {
  const {
    includeUpcoming = true,
    includeCancelled = true
  } = options;

  if (!Array.isArray(bookings) || bookings.length === 0) {
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
  
  const filteredForSummary = bookings.filter((booking) => {
    const status = parseInt(booking.status);
    const end = booking.end || booking.endTime;
    const intentStatus = (booking.intentStatus || '').toLowerCase();
    if (status === 0 && end && Number.isFinite(Number(end)) && now > Number(end)) {
      return false;
    }
    if (status === 5 || booking.statusCategory === 'cancelled') {
      return false;
    }
    if (intentStatus === 'rejected' || intentStatus === 'failed' || intentStatus === 'denied') {
      return false;
    }
    return true;
  });

  const summary = {
    totalBookings: filteredForSummary.length,
    activeBookings: 0,
    upcomingBookings: 0,
    completedBookings: 0,
    cancelledBookings: 0,
    pendingBookings: 0  // Add pending bookings counter
  };

  filteredForSummary.forEach(booking => {
    const statusCategory = booking.statusCategory;
    const status = parseInt(booking.status); // Ensure status is a number
    const start = booking.start || booking.startTime;
    const end = booking.end || booking.endTime;

    // Debug log for each booking
    devLog.log('📊 Processing booking for summary:', {
      reservationKey: booking.reservationKey || booking.id,
      status: booking.status,
      numericStatus: status,
      statusCategory,
      start,
      end,
      now
    });

    // Determine a single bucket so totals always match
    let bucket = null;

    if (statusCategory) {
      switch (statusCategory) {
        case 'active':
        case 'upcoming':
        case 'completed':
        case 'pending':
          bucket = statusCategory;
          break;
        case 'cancelled':
          if (includeCancelled) bucket = 'cancelled';
          break;
        default:
          // fall through to manual calculation
          break;
      }
    }

    if (!bucket) {
      // Fallback to manual calculation based on contract status
      if (status === 5) {
        if (includeCancelled) bucket = 'cancelled';
      } else if (status === 0) {
        // PENDING - ignore expired pending in summary
        if (end && Number.isFinite(Number(end)) && now > Number(end)) {
          return;
        }
        bucket = 'pending';
      } else if (status === 4 || status === 3) {
        bucket = 'completed';
      } else if (status === 2) {
        if (start && end) {
          if (now >= start && now <= end) {
            bucket = 'active';
          } else if (now < start) {
            bucket = 'upcoming';
          } else {
            bucket = 'completed';
          }
        } else {
          bucket = 'active';
        }
      } else if (status === 1) {
        if (start && end) {
          if (now >= start && now <= end) {
            bucket = 'active';
          } else if (now < start) {
            bucket = 'upcoming';
          } else {
            bucket = 'completed';
          }
        } else {
          bucket = 'upcoming';
        }
      } else if (start && end) {
        if (now >= start && now <= end) {
          bucket = 'active';
        } else if (now < start) {
          bucket = 'upcoming';
        } else {
          bucket = 'completed';
        }
      }
    }

    // Ensure every included booking lands in one bucket
    if (!bucket) {
      bucket = 'completed';
    }

    if (bucket === 'active') {
      summary.activeBookings++;
    } else if (bucket === 'upcoming') {
      if (includeUpcoming) summary.upcomingBookings++;
    } else if (bucket === 'pending') {
      summary.pendingBookings++;
    } else if (bucket === 'completed') {
      summary.completedBookings++;
    } else if (bucket === 'cancelled') {
      if (includeCancelled) summary.cancelledBookings++;
    }
  });

  // Debug log final summary
  devLog.log('📊 Final booking summary calculated:', {
    totalBookings: summary.totalBookings,
    pendingBookings: summary.pendingBookings,
    upcomingBookings: summary.upcomingBookings,
    activeBookings: summary.activeBookings,
    completedBookings: summary.completedBookings,
    cancelledBookings: summary.cancelledBookings,
    options
  });

  return summary;
};

/**
 * Helper function to convert status number to text
 * @param {number} status - Status number from contract
 * @returns {string} Human-readable status
 */
function getReservationStatusText(status) {
  switch (status) {
    case 0: return 'Pending';
    case 1: return 'Confirmed';
    case 2: return 'In Use'; 
    case 3: return 'Completed';
    case 4: return 'Collected';
    case 5: return 'Cancelled';
    default: return 'Unknown';
  }
}

/**
 * Composed dashboard hook for getting user bookings with enriched details and comprehensive analytics
 * Supports both wallet users (with address) and institutional users (with PUC from session)
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
  // ARCHITECTURE: Both SSO and Wallet use API-based queryFn in useQueries
  // - SSO: PUC-based endpoints (no address needed)
  // - Wallet: Address-based endpoints (userAddress required)
  const isSSO = useGetIsSSO(queryOptions);
  
  // Step 1: Get user reservation count (using appropriate hook based on user type)
  const ssoCountResult = useReservationsOfSSO({
    ...BOOKING_QUERY_CONFIG,
    enabled: isSSO && (queryOptions.enabled ?? true),
    meta: queryOptions.meta,
  });
  
  const walletCountResult = useReservationsOfWallet(userAddress, {
    ...BOOKING_QUERY_CONFIG,
    enabled: !isSSO && !!userAddress && (queryOptions.enabled ?? true),
    meta: queryOptions.meta,
  });
  
  const reservationCountResult = isSSO ? ssoCountResult : walletCountResult;
  
  // Extract reservation count and apply limit if specified
  const totalReservationCount = reservationCountResult.data?.count || 0;
  const reservationCount = limit ? Math.min(totalReservationCount, limit) : totalReservationCount;
  const hasReservations = reservationCount > 0;

  // DEBUG: Log reservation count details
  devLog.log(`🔍 [useUserBookingsDashboard] User ${isSSO ? 'SSO' : userAddress?.slice(0, 6)}...${userAddress?.slice(-4)}:`, {
    isSSO,
    totalReservationCount,
    reservationCount,
    limit,
    hasReservations,
    willCreateIndices: hasReservations ? `0 to ${reservationCount - 1}` : 'none'
  });

  // Step 2: Get reservation keys for each index (limited if specified)
  // - SSO: useReservationKeyOfUserByIndexSSO.queryFn(index) → PUC-based
  // - Wallet: useReservationKeyOfUserByIndexWallet.queryFn(userAddress, index) → Address-based
  // SAFETY: Additional validation to prevent out-of-range queries
  const safeReservationCount = Math.max(0, Math.min(reservationCount, 100)); // Cap at 100 for safety

  const reservationKeyResults = useQueries({
    queries: hasReservations && safeReservationCount > 0
      ? Array.from({ length: safeReservationCount }, (_, index) => {
          if (index < 0 || index >= safeReservationCount) {
            return {
              queryKey: ['blocked-query', isSSO ? 'sso' : 'wallet', index],
              queryFn: () => Promise.reject(new Error(`Index ${index} out of range`)),
              enabled: false,
              ...BOOKING_QUERY_CONFIG,
            };
          }
          
          // Use appropriate queryFn based on user type
          if (isSSO) {
            return {
              queryKey: bookingQueryKeys.ssoReservationKeyOfUserByIndex(index),
              queryFn: () => useReservationKeyOfUserByIndexSSO.queryFn(index),
              enabled: hasReservations && index >= 0 && index < safeReservationCount,
              ...BOOKING_QUERY_CONFIG,
            };
          } else {
            return {
              queryKey: bookingQueryKeys.reservationKeyOfUserByIndex(userAddress, index),
              queryFn: () => useReservationKeyOfUserByIndexWallet.queryFn(userAddress, index),
              enabled: !!userAddress && hasReservations && index >= 0 && index < safeReservationCount,
              ...BOOKING_QUERY_CONFIG,
            };
          }
        })
      : [],
    combine: (results) => results
  });

  // Extract reservation keys from successful results
  const reservationKeys = reservationKeyResults
    .filter(result => result.isSuccess && result.data)
    .map(result => result.data.reservationKey || result.data);

  // Step 3: Get booking details for each reservation key
  // Note: useReservationSSO.queryFn works for both SSO and Wallet (read-only endpoint)
  const bookingDetailsResults = useQueries({
    queries: reservationKeys.length > 0 
      ? reservationKeys.map(key => ({
          queryKey: bookingQueryKeys.byReservationKey(key),
          queryFn: () => useReservationSSO.queryFn(key),
          enabled: !!key,
          ...BOOKING_QUERY_CONFIG,
          retry: (failureCount, error) => {
            if (error?.message?.includes('404') || 
                error?.message?.includes('not found') ||
                error?.message?.includes('400')) {
              return false;
            }
            return failureCount < 1;
          },
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
      statusCategory,
      start: startTime,
      end: endTime,
      // date as ISO string (yyyy-mm-dd or full ISO ok; consumers parse via new Date())
      date: startTime ? new Date(startTime * 1000).toISOString() : null,
    };

    return flat;
  });

  // For lab details fetching we need labIds
  const allLabsResult = useAllLabs({ enabled: includeLabDetails && (queryOptions.enabled ?? true) });
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

/**
 * Dashboard-focused hook for getting lab bookings with enriched data and analytics
 * Orchestrates: lab reservations count → reservation keys → reservation details → status enrichment
 * Provides booking summary analytics and user details for provider dashboard components
 * @param {string|number} labId - Lab ID
 * @param {Object} options - Configuration options
 * @param {boolean} options.includeUserDetails - Whether to fetch user details for each booking
 * @param {Object} options.queryOptions - Additional react-query options
 * @returns {Object} React Query result with enriched lab booking data and analytics summary
 */
export const useLabBookingsDashboard = (labId, { 
  includeUserDetails = false, 
  queryOptions = {} 
} = {}) => {
  
  // ARCHITECTURE: This hook queries lab reservations (public data, not user-specific).
  // Uses API-based queryFn for useQueries compatibility (Wagmi hooks cannot be extracted).
  // Works identically for both SSO and Wallet users - the queries are lab-centric, not user-centric.
  
  // Debug log for input parameters
  devLog.log('📅 useLabBookingsDashboard called with:', {
    labId,
    includeUserDetails,
    queryMode: 'API-based (required for useQueries)',
    reason: 'Lab reservations are public data, queryFn must be extractable'
  });
  
  // Step 1: Get reservation count for lab (uses API path for useQueries compatibility)
  const reservationCountResult = useReservationsOfToken(labId, {
    ...BOOKING_QUERY_CONFIG,
    enabled: !!labId && (queryOptions.enabled !== false),
    meta: queryOptions.meta,
    isSSO: true, // Use API path (required: useQueries needs extractable queryFn)
  });
  
  const reservationCount = reservationCountResult.data?.count || 0;
  
  // Debug log for reservation count
  devLog.log('📊 Lab reservations count:', {
    labId,
    reservationCount,
    isLoading: reservationCountResult.isLoading,
    isError: reservationCountResult.isError,
    error: reservationCountResult.error,
    data: reservationCountResult.data
  });
  
  // Step 2: Get all reservation keys for this lab using indices
  const reservationKeyResults = useQueries({
    queries: reservationCount > 0 
      ? Array.from({ length: reservationCount }, (_, index) => ({
          queryKey: bookingQueryKeys.getReservationOfTokenByIndex(labId, index),
          queryFn: () => useReservationOfTokenByIndexSSO.queryFn(labId, index),
          enabled: !!labId && reservationCount > 0,
          ...BOOKING_QUERY_CONFIG,
        }))
      : [],
    combine: (results) => results
  });
  
  // Extract reservation keys from successful results
  const reservationKeys = reservationKeyResults
    .filter(result => result.isSuccess && result.data?.reservationKey)
    .map(result => result.data.reservationKey);
  
  // Debug log for reservation keys
  devLog.log('🔑 Lab reservation keys:', {
    labId,
    reservationKeys,
    reservationKeyResults: reservationKeyResults.map(r => ({
      isSuccess: r.isSuccess,
      isError: r.isError,
      data: r.data,
      error: r.error
    }))
  });
  
  // Step 3: Get detailed reservation data for each key
  const reservationDetailResults = useQueries({
    queries: reservationKeys.length > 0 
      ? reservationKeys.map(reservationKey => ({
          queryKey: bookingQueryKeys.byReservationKey(reservationKey),
          queryFn: () => useReservationSSO.queryFn(reservationKey),
          enabled: !!reservationKey,
          ...BOOKING_QUERY_CONFIG,
        }))
      : [],
    combine: (results) => results
  });
  
  // Process reservation data and determine statuses
  const now = Math.floor(Date.now() / 1000);
  
  // Get optimistic bookings from cache for this lab
  const queryClient = useQueryClient();
  const optimisticBookings = queryClient.getQueryData(bookingQueryKeys.byLab(labId)) || [];
  const optimisticOnly = optimisticBookings.filter(booking => booking.isOptimistic === true);
  
  devLog.log('🔄 Optimistic bookings for lab:', {
    labId,
    optimisticCount: optimisticOnly.length,
    optimisticBookings: optimisticOnly.map(b => ({
      id: b.id,
      start: b.start,
      isPending: b.isPending
    }))
  });
  
  const processedBookings = reservationDetailResults
    .filter(result => result.isSuccess && result.data)
    .map(result => {
      const booking = result.data;
      
      // Extract timestamps (they come as Unix timestamps)
      const startTime = booking.reservation?.start || booking.startTime || booking.start;
      const endTime = booking.reservation?.end || booking.endTime || booking.end;
      
      // Use original contract status (numeric)
      const contractStatus = booking.reservation?.status ?? booking.status ?? 0;

      // Create enriched booking with all required fields for calendar
      const enrichedBooking = {
        ...booking,
        // Required fields for calendar display
        id: booking.reservationKey || booking.id,
        reservationKey: booking.reservationKey,
        labId: parseInt(labId),
        
        // Status
        status: contractStatus,
        
        // Time fields (keep both Unix timestamps and formatted versions)
        start: startTime,
        end: endTime,
        startTime,
        endTime,
        
        // Date field required by calendar (convert from Unix timestamp to YYYY-MM-DD format)
        date: startTime ? new Date(startTime * 1000).toLocaleDateString('en-CA') : null,
        
        // User information
        userAddress: booking.reservation?.renter || booking.userAddress,
      };

      // Add user details formatting if user address exists
      if (includeUserDetails && enrichedBooking.userAddress) {
        enrichedBooking.userDetails = {
          address: enrichedBooking.userAddress,
          displayAddress: `${enrichedBooking.userAddress.slice(0, 6)}...${enrichedBooking.userAddress.slice(-4)}`
        };
      }

      return enrichedBooking;
    });

  // Debug log for processed bookings
  devLog.log('📋 Processed lab bookings:', {
    labId,
    processedBookingsCount: processedBookings.length,
    processedBookings: processedBookings.map(b => ({
      id: b.id,
      reservationKey: b.reservationKey,
      status: b.status,
      start: b.start,
      end: b.end,
      date: b.date,
      userAddress: b.userAddress
    })),
    reservationDetailResults: reservationDetailResults.map(r => ({
      isSuccess: r.isSuccess,
      isError: r.isError,
      data: r.data ? {
        reservationKey: r.data.reservationKey,
        reservation: r.data.reservation
      } : null,
      error: r.error
    }))
  });

  // Calculate aggregates using utility function 
  const aggregates = calculateBookingSummary(processedBookings, {
    includeUpcoming: true,
    includeCancelled: true
  });

  // Add lab-specific status aggregates
  const labSpecificAggregates = {
    pendingBookings: processedBookings.filter(b => b.status === 0).length,       // PENDING
    confirmedBookings: processedBookings.filter(b => b.status === 1).length,     // BOOKED/CONFIRMED
    usedBookings: processedBookings.filter(b => b.status === 2).length,          // USED
    collectedBookings: processedBookings.filter(b => b.status === 3).length,     // COLLECTED
  };

  // Combine standard and lab-specific aggregates
  const combinedAggregates = { ...aggregates, ...labSpecificAggregates };

  // Merge optimistic bookings with processed bookings (following granular cache pattern)
  const allBookings = useMemo(() => {
    // Filter out optimistic bookings that have been replaced by real ones
    const filteredOptimistic = optimisticOnly.filter(optBooking => {
      const isDuplicate = processedBookings.some(realBooking => {
        const realStart = parseInt(realBooking.start);
        const optStart = parseInt(optBooking.start);
        return realBooking.labId?.toString() === optBooking.labId?.toString() &&
               Math.abs(realStart - optStart) < 60; // Within 1 minute tolerance
      });
      return !isDuplicate;
    });
    
    if (filteredOptimistic.length > 0) {
      devLog.log('✨ Including optimistic bookings in lab bookings:', {
        labId,
        optimisticCount: filteredOptimistic.length,
        totalCount: processedBookings.length + filteredOptimistic.length
      });
    }
    
    return [...processedBookings, ...filteredOptimistic];
  }, [processedBookings, optimisticOnly, labId]);

  // Status calculation
  const isLoading = reservationCountResult.isLoading || 
                   reservationKeyResults.some(r => r.isLoading) ||
                   reservationDetailResults.some(r => r.isLoading);
  
  const isError = reservationCountResult.isError || 
                 reservationKeyResults.some(r => r.isError) ||
                 reservationDetailResults.some(r => r.isError);
  
  const error = reservationCountResult.error || 
               reservationKeyResults.find(r => r.error)?.error ||
               reservationDetailResults.find(r => r.error)?.error;

  return {
    // Data
    data: {
      labId,
      bookings: allBookings,
      ...combinedAggregates,
    },
    
    // Status
    isLoading,
    isSuccess: !isError && !isLoading && processedBookings.length >= 0,
    isError,
    error,
    
    // Meta information
    meta: {
      includeUserDetails,
      reservationCount,
      totalQueries: 1 + reservationKeyResults.length + reservationDetailResults.length,
      successfulQueries: [reservationCountResult].concat(reservationKeyResults, reservationDetailResults).filter(r => r.isSuccess).length,
      failedQueries: [reservationCountResult].concat(reservationKeyResults, reservationDetailResults).filter(r => r.isError).length,
      timestamp: new Date().toISOString()
    },

    // Individual results for debugging
    baseResults: {
      reservationCount: reservationCountResult,
      reservationKeys: reservationKeyResults,
      reservationDetails: reservationDetailResults
    },

    // Utility functions
    refetch: () => {
      reservationCountResult.refetch();
      reservationKeyResults.forEach(result => result.refetch());
      reservationDetailResults.forEach(result => result.refetch());
    }
  };
};

/**
 * Cache extraction helper for finding a specific booking from user bookings
 * @param {Object} userBookingsResult - Result from useUserBookingsDashboard
 * @param {string} reservationKey - Reservation key to find
 * @returns {Object|null} Booking data if found, null otherwise
 */
export const extractBookingFromUser = (userBookingsResult, reservationKey) => {
  if (!userBookingsResult?.data?.bookings || !reservationKey) return null;
  
  return userBookingsResult.data.bookings.find(booking => 
    booking.reservationKey === reservationKey
  ) || null;
};

/**
 * Cache extraction helper for filtering bookings by status category
 * @param {Object} bookingsResult - Result from composed booking hooks
 * @param {string} statusCategory - Status to filter by (active, completed, cancelled, upcoming)
 * @returns {Array} Array of bookings with the specified status
 */
export const extractBookingsByStatus = (bookingsResult, statusCategory) => {
  if (!bookingsResult?.data?.bookings || !statusCategory) return [];
  
  return bookingsResult.data.bookings.filter(booking => 
    booking.statusCategory === statusCategory
  );
};

/**
 * Cache extraction helper for getting active bookings
 * @param {Object} bookingsResult - Result from composed booking hooks
 * @returns {Array} Array of active bookings
 */
export const extractActiveBookings = (bookingsResult) => {
  return extractBookingsByStatus(bookingsResult, 'active');
};

/**
 * Cache extraction helper for getting upcoming bookings
 * @param {Object} bookingsResult - Result from composed booking hooks
 * @returns {Array} Array of upcoming bookings
 */
export const extractUpcomingBookings = (bookingsResult) => {
  return extractBookingsByStatus(bookingsResult, 'upcoming');
};

/**
 * Cache extraction helper for getting completed bookings
 * @param {Object} bookingsResult - Result from composed booking hooks
 * @returns {Array} Array of completed bookings
 */
export const extractCompletedBookings = (bookingsResult) => {
  return extractBookingsByStatus(bookingsResult, 'completed');
};

/**
 * Cache extraction helper for getting cancelled bookings
 * @param {Object} bookingsResult - Result from composed booking hooks
 * @returns {Array} Array of cancelled bookings
 */
export const extractCancelledBookings = (bookingsResult) => {
  return extractBookingsByStatus(bookingsResult, 'cancelled');
};

// Module loaded confirmation (only logs once even in StrictMode)
devLog.moduleLoaded('✅ Booking composed hooks loaded');
