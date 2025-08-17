/**
 * Main marketplace component displaying available labs with search and filtering
 * Central hub for users to discover and access laboratory resources
 * Integrates with user authentication, bookings, and lab data management
 * @returns {JSX.Element} Complete marketplace interface with lab grid, search, and user-specific features
 */
"use client";
import React, { useMemo } from 'react'
import { useUser } from '@/context/UserContext'
import { useAllLabsComposed } from '@/hooks/lab/useLabs'
import { useUserBookingsComposed } from '@/hooks/booking/useBookings'
import { useLabFilters } from '@/hooks/lab/useLabFilters'
import LabFilters from '@/components/home/LabFilters'
import LabGrid from '@/components/home/LabGrid'
import devLog from '@/utils/dev/logger'

export default function Market() {
  const { isLoggedIn, address } = useUser();
  
  // React Query for labs with metadata (memoized options)
  const labsQueryOptions = useMemo(() => ({
    includeMetadata: true, 
    includeOwners: false 
  }), []);
  
  const labsQuery = useAllLabsComposed(labsQueryOptions);
  
  const { 
    data: labsData, 
    isLoading: labsInitialLoading,
    isFetching: labsFetching,
    isError: labsError,
    error: labsErrorDetails 
  } = labsQuery;
  
  // Extract labs array from composed result and memoize
  const labsArray = useMemo(() => labsData?.labs || [], [labsData?.labs]);
  
  // Determine labs loading state (stable)
  const labsLoading = useMemo(() => {
    return labsInitialLoading || (labsFetching && labsArray.length === 0);
  }, [labsInitialLoading, labsFetching, labsArray.length]);

  // Memoize labs to prevent infinite re-renders
  const labs = useMemo(() => labsArray, [labsArray]);

  // React Query for user bookings (memoized options)
  const userBookingsOptions = useMemo(() => ({
    enabled: !!address && isLoggedIn,
  }), [address, isLoggedIn]);
  
  const userBookingsQuery = useUserBookingsComposed(address, userBookingsOptions);

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
  const userBookings = useMemo(() => userBookingsData?.bookings || [], [userBookingsData?.bookings]);

  // Use custom hook for filtering logic (with stable dependencies)
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
  } = useLabFilters(labs, userBookings, isLoggedIn);

  return (
    <main className="container mx-auto p-6">
      <LabFilters
        categories={categories}
        providers={providers}
        selectedCategory={selectedCategory}
        selectedPrice={selectedPrice}
        selectedProvider={selectedProvider}
        selectedFilter={selectedFilter}
        onCategoryChange={setSelectedCategory}
        onPriceChange={setSelectedPrice}
        onProviderChange={setSelectedProvider}
        onFilterChange={setSelectedFilter}
        onReset={resetFilters}
        searchInputRef={searchInputRef}
        loading={labsLoading}
      />

      <LabGrid
        labs={searchFilteredLabs}
        loading={labsLoading}
        error={labsError}
        emptyMessage="No labs found matching your search criteria. Try adjusting your filters."
      />
    </main>
  )
}