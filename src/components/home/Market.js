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

export default function Market({ initialLabs = [] }) {
  const { isLoggedIn, address, isWalletLoading, hasWalletSession, isSSO } = useUser();
  const [isHydrated, setIsHydrated] = useState(false);
  
  // State for show unlisted option
  const [showUnlisted, setShowUnlisted] = useState(false);
  const [isFilterTransitionPending, startFilterTransition] = useTransition();
  const snapshotLabs = useMemo(
    () => (Array.isArray(initialLabs) ? initialLabs : []),
    [initialLabs]
  );
  const hasInitialSnapshot = !showUnlisted && snapshotLabs.length > 0;
  const shouldFetchLiveLabs = showUnlisted || !hasInitialSnapshot;
  
  // React Query for labs optimized for market display (with conditional unlisted inclusion)
  const labsQuery = useLabsForMarket({ 
    includeUnlisted: showUnlisted,
    enabled: shouldFetchLiveLabs
  });
  
  const { 
    data: labsData, 
    isLoading: labsInitialLoading,
    isFetching: labsFetching,
    isError: labsError,
  } = labsQuery;
  
  // Extract labs array from composed result and memoize
  const labsArray = useMemo(() => {
    if (hasInitialSnapshot && !shouldFetchLiveLabs) {
      return snapshotLabs;
    }

    return labsData?.labs || [];
  }, [hasInitialSnapshot, shouldFetchLiveLabs, snapshotLabs, labsData?.labs]);
  
  // Determine labs loading state (stable) - Show labs immediately, don't wait for bookings
  const labsLoading = useMemo(() => {
    if (hasInitialSnapshot && !shouldFetchLiveLabs) {
      return false;
    }

    return labsInitialLoading || (labsFetching && labsArray.length === 0);
  }, [hasInitialSnapshot, shouldFetchLiveLabs, labsInitialLoading, labsFetching, labsArray.length]);

  // Memoize labs to prevent infinite re-renders
  const labs = useMemo(() => labsArray, [labsArray]);
  const shouldShowLabsError = shouldFetchLiveLabs ? labsError : false;

  // React Query for user bookings (memoized options) - supports both SSO and wallet sessions
  const shouldFetchUserBookings = useMemo(() => canFetchUserBookings({
    isLoggedIn,
    isSSO,
    address,
    hasWalletSession,
    isWalletLoading,
  }), [isLoggedIn, isSSO, address, hasWalletSession, isWalletLoading]);

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
    searchFilteredLabs,
    setSelectedCategory,
    setSelectedPrice,
    setSelectedProvider,
    setSelectedFilter,
    categories,
    providers,
    searchInputRef,
    resetFilters
  } = useLabFilters(labs, userBookings, isLoggedIn, bookingsLoading, isHydrated);

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
