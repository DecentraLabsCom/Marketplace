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
import { usePublicMarketLabs } from '@/hooks/lab/useLabs'
import { useUserBookingsForMarket } from '@/hooks/booking/useBookings'
import { useLabFilters } from '@/hooks/lab/useLabs'
import LabFilters from '@/components/home/LabFilters'
import LabGrid from '@/components/home/LabGrid'
import { canFetchUserBookings, resolveBookingsUserAddress } from '@/utils/auth/bookingAccess'
import useCurrentTime from '@/hooks/useCurrentTime'

export default function Market({ initialMarketSnapshot = null }) {
  const { isLoggedIn, address, isSSO } = useUser();
  const [isHydrated, setIsHydrated] = useState(false);
  const now = useCurrentTime({ intervalMs: 20000 });
  
  // State for show unlisted option
  const [showUnlisted, setShowUnlisted] = useState(false);
  const [isFilterTransitionPending, startFilterTransition] = useTransition();
  const labsQuery = usePublicMarketLabs({
    includeUnlisted: showUnlisted,
    enabled: true,
    initialData: initialMarketSnapshot,
  });
  
  const {
    data: labsData, 
    isLoading: labsInitialLoading,
    isFetching: labsFetching,
    isError: labsError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = labsQuery;

  const labsArray = useMemo(() => labsData?.labs || [], [labsData?.labs]);
  const labsLoading = labsInitialLoading || (labsFetching && labsArray.length === 0);

  // Memoize labs to prevent infinite re-renders
  const labs = useMemo(() => labsArray, [labsArray]);
  // Only surface an error when there is nothing at all to display
  const shouldShowLabsError = labsError && labsArray.length === 0;

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage?.();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

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
    <Container padding="sm">
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
        hasMore={Boolean(hasNextPage)}
        onLoadMore={handleLoadMore}
        loadingMore={Boolean(isFetchingNextPage)}
        emptyMessage="No labs found matching your search criteria. Try adjusting your filters."
      />
    </Container>
  )
}

Market.propTypes = {
  initialMarketSnapshot: PropTypes.shape({
    labs: PropTypes.array,
    cursor: PropTypes.number,
    nextCursor: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    snapshotAt: PropTypes.string,
  }),
}
