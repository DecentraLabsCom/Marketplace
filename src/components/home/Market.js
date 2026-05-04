/**
 * Main marketplace component displaying available labs with search and filtering
 * Central hub for users to discover and access laboratory resources
 * Integrates with user authentication, bookings, and lab data management
 * @returns {JSX.Element} Complete marketplace interface with lab grid, search, and user-specific features
 */
"use client";
import React, { useMemo, useState, useCallback, useEffect, useTransition } from 'react'
import PropTypes from 'prop-types'
import { Container } from '@/components/ui'
import { useUser } from '@/context/UserContext'
import { useLabsForMarket } from '@/hooks/lab/useLabs'
import { useUserBookingsForMarket } from '@/hooks/booking/useBookings'
import { useLabFilters } from '@/hooks/lab/useLabs'
import LabFilters from '@/components/home/LabFilters'
import LabGrid from '@/components/home/LabGrid'
import { canFetchUserBookings, resolveBookingsUserAddress } from '@/utils/auth/bookingAccess'
import useCurrentTime from '@/hooks/useCurrentTime'

export default function Market({ initialLabs = [] }) {
  const { isLoggedIn, address, isSSO } = useUser();
  const [isHydrated, setIsHydrated] = useState(false);
  const now = useCurrentTime({ intervalMs: 20000 });
  
  // State for show unlisted option
  const [showUnlisted, setShowUnlisted] = useState(false);
  const [isFilterTransitionPending, startFilterTransition] = useTransition();
  const snapshotLabs = useMemo(
    () => (Array.isArray(initialLabs) ? initialLabs : []),
    [initialLabs]
  );

  // Always run the live query so listing/unlisting state changes are reflected immediately
  // (optimistic state, cache invalidations after list/unlist actions all work correctly).
  // The SSR snapshot is used as a loading placeholder until the live query resolves.
  const labsQuery = useLabsForMarket({ 
    includeUnlisted: showUnlisted,
    enabled: true
  });
  
  const {
    data: labsData, 
    isLoading: labsInitialLoading,
    isFetching: labsFetching,
    isError: labsError,
  } = labsQuery;
  
  // Prefer live data (fresh, reflects latest listing state and images).
  // Fall back to SSR snapshot while the live query is still loading.
  const labsArray = useMemo(() => {
    if (labsData?.labs) {
      return labsData.labs;
    }
    if (!showUnlisted && snapshotLabs.length > 0) {
      return snapshotLabs;
    }
    return [];
  }, [labsData?.labs, showUnlisted, snapshotLabs]);
  
  // Suppress the loading state when snapshot data is available as a stand-in.
  const labsLoading = useMemo(() => {
    if (!labsData?.labs && !showUnlisted && snapshotLabs.length > 0) {
      return false;
    }
    return labsInitialLoading || (labsFetching && labsArray.length === 0);
  }, [labsData?.labs, showUnlisted, snapshotLabs.length, labsInitialLoading, labsFetching, labsArray.length]);

  // Memoize labs to prevent infinite re-renders
  const labs = useMemo(() => labsArray, [labsArray]);
  // Only surface an error when there is nothing at all to display
  const shouldShowLabsError = labsError && labsArray.length === 0;

  // React Query for user bookings scoped to institutional sessions.
  const shouldFetchUserBookings = useMemo(() => canFetchUserBookings({
    isLoggedIn,
    isSSO,
    address,
  }), [isLoggedIn, isSSO, address]);

  const bookingsUserAddress = useMemo(
    () => resolveBookingsUserAddress({ isSSO, address }),
    [isSSO, address]
  );

  const userBookingsOptions = useMemo(() => ({
    enabled: shouldFetchUserBookings,
    queryOptions: {
      refetchOnMount: false, // Use cached data if available
    }
  }), [shouldFetchUserBookings]);
  
  const userBookingsQuery = useUserBookingsForMarket(bookingsUserAddress, userBookingsOptions);

  const {
    data: userBookingsData,
    isLoading: bookingsInitialLoading,
    isFetching: bookingsFetching,
  } = userBookingsQuery;
  
  // Determine bookings loading state (stable)
  const bookingsLoading = useMemo(() => {
    return bookingsInitialLoading || (bookingsFetching && !userBookingsData);
  }, [bookingsInitialLoading, bookingsFetching, userBookingsData]);

  // Memoize userBookings to prevent infinite re-renders
  const userBookings = useMemo(() => userBookingsData || {
    userLabsWithActiveBookings: new Set(),
    activeBookingsCount: 0,
    upcomingBookingsCount: 0,
    hasBookingInLab: () => false
  }, [userBookingsData]);

  // Use custom hook for filtering logic (with progressive loading)
  // Pass labs immediately, userBookings only when available (for active booking marking)
  const {
    selectedCategory,
    selectedPrice,
    selectedProvider,
    selectedFilter,
    selectedResourceType,
    searchFilteredLabs,
    setSelectedCategory,
    setSelectedPrice,
    setSelectedProvider,
    setSelectedFilter,
    setSelectedResourceType,
    categories,
    providers,
    searchInputRef,
    resetFilters
  } = useLabFilters(labs, userBookings, isLoggedIn, bookingsLoading, isHydrated, now);

  const handleCategoryChange = useCallback((value) => {
    startFilterTransition(() => setSelectedCategory(value));
  }, [setSelectedCategory, startFilterTransition]);

  const handlePriceChange = useCallback((value) => {
    startFilterTransition(() => setSelectedPrice(value));
  }, [setSelectedPrice, startFilterTransition]);

  const handleProviderChange = useCallback((value) => {
    startFilterTransition(() => setSelectedProvider(value));
  }, [setSelectedProvider, startFilterTransition]);

  const handleFilterChange = useCallback((value) => {
    startFilterTransition(() => setSelectedFilter(value));
  }, [setSelectedFilter, startFilterTransition]);

  const handleResourceTypeChange = useCallback((value) => {
    startFilterTransition(() => setSelectedResourceType(value));
  }, [setSelectedResourceType, startFilterTransition]);

  // Handle reset to also reset showUnlisted
  const handleReset = useCallback(() => {
    startFilterTransition(() => {
      resetFilters();
      setShowUnlisted(false);
    });
  }, [resetFilters, startFilterTransition]);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  return (
    <Container as="main" padding="sm">
      {isHydrated ? (
        <LabFilters
          categories={categories}
          providers={providers}
          selectedCategory={selectedCategory}
          selectedPrice={selectedPrice}
          selectedProvider={selectedProvider}
          selectedFilter={selectedFilter}
          showUnlisted={showUnlisted}
          onCategoryChange={handleCategoryChange}
          onPriceChange={handlePriceChange}
          onProviderChange={handleProviderChange}
          onFilterChange={handleFilterChange}
          onShowUnlistedChange={setShowUnlisted}
          selectedResourceType={selectedResourceType}
          onResourceTypeChange={handleResourceTypeChange}
          onReset={handleReset}
          searchInputRef={searchInputRef}
          loading={labsLoading || isFilterTransitionPending}
        />
      ) : null}

      <LabGrid
        labs={searchFilteredLabs}
        loading={labsLoading}
        error={shouldShowLabsError}
        emptyMessage="No labs found matching your search criteria. Try adjusting your filters."
      />
    </Container>
  )
}

Market.propTypes = {
  initialLabs: PropTypes.array,
}
