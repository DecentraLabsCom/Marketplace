/**
 * Main marketplace component displaying available labs with search and filtering
 * Central hub for users to discover and access laboratory resources
 * Integrates with user authentication, bookings, and lab data management
 * @returns {JSX.Element} Complete marketplace interface with lab grid, search, and user-specific features
 */
"use client";
import React, { useMemo } from 'react'
import { useUser } from '@/context/UserContext'
import { useAllLabsQuery } from '@/hooks/lab/useLabs'
import { useUserBookingsQuery } from '@/hooks/booking/useBookings'
import { useLabFilters } from '@/hooks/lab/useLabFilters'
import LabFilters from '@/components/home/LabFilters'
import LabGrid from '@/components/home/LabGrid'
import devLog from '@/utils/dev/logger'

export default function Market() {
  devLog.log('🏪 Market component rendered at:', new Date().toLocaleTimeString());
  
  const { isLoggedIn, address } = useUser();
  
  // React Query for labs
  const labsQuery = useAllLabsQuery({
    staleTime: 30 * 60 * 1000, // 30 minutes - blockchain data doesn't change frequently
    refetchOnWindowFocus: false, // Disable automatic refetch on window focus
    refetchInterval: false, // Disable automatic periodic refetch
  });
  
  const { 
    data: labsData = [], 
    isInitialLoading: labsInitialLoading,
    isFetching: labsFetching,
    isError: labsError,
    error: labsErrorDetails 
  } = labsQuery;
  // Determine labs loading state
  const labsLoading = labsInitialLoading || labsFetching || labsData.length === 0;

  // Memoize labs to prevent infinite re-renders
  const labs = useMemo(() => labsData, [labsData]);

  // React Query for user bookings
  const userBookingsQuery = useUserBookingsQuery(address, null, null, {
    enabled: !!address && isLoggedIn,
    refetchOnWindowFocus: true,
  });

  const {
    data: userBookingsData,
    isInitialLoading: bookingsInitialLoading,
    isFetching: bookingsFetching,
  } = userBookingsQuery;
  // Determine bookings loading state
  const bookingsLoading = bookingsInitialLoading || (bookingsFetching && !userBookingsData)

  // Memoize userBookings to prevent infinite re-renders
  const userBookings = useMemo(() => userBookingsData?.bookings || [], [userBookingsData]);

  // Use custom hook for filtering logic
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
  } = useLabFilters(labs, userBookings, isLoggedIn)

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
        loading={labsLoading || bookingsLoading}
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