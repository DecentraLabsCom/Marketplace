/**
 * Main marketplace component displaying available labs with search and filtering
 * Central hub for users to discover and access laboratory resources
 * Integrates with user authentication, bookings, and lab data management
 * @returns {JSX.Element} Complete marketplace interface with lab grid, search, and user-specific features
 */
"use client";
import React, { useMemo, useState, useCallback, useEffect } from 'react'
import { Container } from '@/components/ui'
import { useUser } from '@/context/UserContext'
import { useLabsForMarket } from '@/hooks/lab/useLabs'
import { useUserBookingsForMarket } from '@/hooks/booking/useBookings'
import { useLabFilters } from '@/hooks/lab/useLabs'
import LabFilters from '@/components/home/LabFilters'
import LabGrid from '@/components/home/LabGrid'
import { canFetchUserBookings, resolveBookingsUserAddress } from '@/utils/auth/bookingAccess'
import devLog from '@/utils/dev/logger'

export default function Market() {
  const { isLoggedIn, address, isWalletLoading, hasWalletSession, isSSO } = useUser();
  const [isHydrated, setIsHydrated] = useState(false);
  
  // State for show unlisted option
  const [showUnlisted, setShowUnlisted] = useState(false);
  
  // React Query for labs optimized for market display (with conditional unlisted inclusion)
  const labsQuery = useLabsForMarket({ 
    includeUnlisted: showUnlisted 
  });
  
  const { 
    data: labsData, 
    isLoading: labsInitialLoading,
    isFetching: labsFetching,
    isError: labsError,
    error: labsErrorDetails 
  } = labsQuery;
  
  // Extract labs array from composed result and memoize
  const labsArray = useMemo(() => labsData?.labs || [], [labsData?.labs]);
  
  // Determine labs loading state (stable) - Show labs immediately, don't wait for bookings
  const labsLoading = useMemo(() => {
    return labsInitialLoading || (labsFetching && labsArray.length === 0);
  }, [labsInitialLoading, labsFetching, labsArray.length]);

  // Memoize labs to prevent infinite re-renders
  const labs = useMemo(() => labsArray, [labsArray]);

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

  // Handle reset to also reset showUnlisted
  const handleReset = useCallback(() => {
    resetFilters();
    setShowUnlisted(false);
  }, [resetFilters]);

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
          onCategoryChange={setSelectedCategory}
          onPriceChange={setSelectedPrice}
          onProviderChange={setSelectedProvider}
          onFilterChange={setSelectedFilter}
          onShowUnlistedChange={setShowUnlisted}
          onReset={handleReset}
          searchInputRef={searchInputRef}
          loading={labsLoading}
        />
      ) : null}

      <LabGrid
        labs={searchFilteredLabs}
        loading={labsLoading}
        error={labsError}
        emptyMessage="No labs found matching your search criteria. Try adjusting your filters."
      />
    </Container>
  )
}
