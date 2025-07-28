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
import LabFilters from '@/components/labs/LabFilters'
import LabGrid from '@/components/labs/LabGrid'
import devLog from '@/utils/dev/logger'

export default function Market() {
  devLog.log('🏪 Market component rendered at:', new Date().toLocaleTimeString());
  
  const { isLoggedIn, address } = useUser()
  
  // React Query for labs
  const { 
    data: labs = [], 
    isLoading: loading, 
    isError: labsError,
    error: labsErrorDetails 
  } = useAllLabsQuery({
    staleTime: 30 * 60 * 1000, // 30 minutes - blockchain data doesn't change frequently
    refetchOnWindowFocus: false, // Disable automatic refetch on window focus
    refetchInterval: false, // Disable automatic periodic refetch
  })
  
  // React Query for user bookings
  const { 
    data: userBookingsData = [], 
    isLoading: bookingsLoading 
  } = useUserBookingsQuery(address, null, null, {
    enabled: !!address && isLoggedIn,
    staleTime: 2 * 60 * 1000, // 2 minutes - more dynamic bookings
    refetchOnWindowFocus: true,
  })

  // Memoize userBookings to prevent infinite re-renders
  const userBookings = useMemo(() => userBookingsData, [userBookingsData])

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
        loading={loading || bookingsLoading}
      />

      <LabGrid
        labs={searchFilteredLabs}
        loading={loading}
        error={labsError}
        emptyMessage="No labs found matching your search criteria. Try adjusting your filters."
      />
    </main>
  )
}

