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
  const [isFilterTransitionPending, startFilterTransition] = useTransition();

  // The controls own only the selection state. Search, filters and sorting are
  // applied by the public catalogue API across every server-side page.
  const marketFilters = useLabFilters([], null, false, false, isHydrated, now);
  const {
    selectedCategory,
    selectedPrice,
    selectedProvider,
    selectedFilter,
    selectedResourceType,
    showUnlisted,
    searchDebounce,
    setSelectedCategory,
    setSelectedPrice,
    setSelectedProvider,
    setSelectedFilter,
    setSelectedResourceType,
    setShowUnlisted,
    searchInputRef,
    resetFilters,
  } = marketFilters;
  const catalogueFilters = useMemo(() => ({
    ...(searchDebounce ? { q: searchDebounce, searchField: selectedFilter.toLowerCase() } : {}),
    ...(selectedCategory !== 'All' ? { category: selectedCategory } : {}),
    ...(selectedProvider !== 'All' ? { provider: selectedProvider } : {}),
    ...(selectedResourceType !== 'All' ? { resourceType: selectedResourceType } : {}),
    ...(selectedPrice === 'Low to High'
      ? { sort: 'price_asc' }
      : selectedPrice === 'High to Low'
        ? { sort: 'price_desc' }
        : {}),
  }), [
    searchDebounce,
    selectedCategory,
    selectedFilter,
    selectedPrice,
    selectedProvider,
    selectedResourceType,
  ]);
  const labsQuery = usePublicMarketLabs({
    includeUnlisted: showUnlisted,
    enabled: true,
    initialData: initialMarketSnapshot,
    filters: catalogueFilters,
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
  const catalogueStatus = labsData?.catalogueStatus || 'fresh';

  // Only user-specific booking flags are enriched in the browser. Catalogue
  // membership, search and sorting are determined by the server response.
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

  const labs = useMemo(() => labsArray.map((lab) => ({
    ...lab,
    hasActiveBooking: isLoggedIn && !bookingsLoading && Boolean(userBookings?.hasBookingInLab?.(lab.id)),
    activeBookingKey: isLoggedIn && !bookingsLoading
      ? userBookings?.getActiveBookingKey?.(lab.id) || null
      : null,
  })), [labsArray, isLoggedIn, bookingsLoading, userBookings]);
  const categories = labsData?.facets?.categories || [];
  const providers = labsData?.facets?.providers || [];

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
        labs={labs}
        loading={labsLoading}
        error={shouldShowLabsError}
        hasMore={Boolean(hasNextPage)}
        onLoadMore={handleLoadMore}
        loadingMore={Boolean(isFetchingNextPage)}
        catalogueStatus={catalogueStatus}
        snapshotAt={labsData?.snapshotAt || null}
        emptyMessage="No labs found matching your search criteria. Try adjusting your filters."
      />
    </Container>
  );
}

Market.propTypes = {
  initialMarketSnapshot: PropTypes.shape({
    labs: PropTypes.array,
    cursor: PropTypes.number,
    nextCursor: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    snapshotAt: PropTypes.string,
    catalogueStatus: PropTypes.oneOf(['fresh', 'stale', 'unavailable']),
  }),
}
