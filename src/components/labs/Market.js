/**
 * Main marketplace component displaying available labs with search and filtering
 * Central hub for users to discover and access laboratory resources
 * Integrates with user authentication, bookings, and lab data management
 * @returns {JSX.Element} Complete marketplace interface with lab grid, search, and user-specific features
 */
"use client";
import React from 'react'
import { useUser } from '@/context/UserContext'
import { useAllLabsQuery } from '@/hooks/lab/useLabs'
import { useUserBookingsQuery } from '@/hooks/booking/useBookings'
import { useLabFilters } from '@/hooks/lab/useLabFilters'
import LabFilters from '@/components/labs/LabFilters'
import LabGrid from '@/components/labs/LabGrid'

export default function Market() {
  const { isLoggedIn, address } = useUser()
  
  // ðŸš€ React Query for labs
  const { 
    data: labs = [], 
    isLoading: loading, 
    isError: labsError,
    error: labsErrorDetails 
  } = useAllLabsQuery({
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60 * 1000, // Auto-refetch every 5 minutes
  })
  
  // ðŸš€ React Query for user bookings
  const { 
    data: userBookings = [], 
    isLoading: bookingsLoading 
  } = useUserBookingsQuery(address, null, null, {
    enabled: !!address && isLoggedIn,
    staleTime: 2 * 60 * 1000, // 2 minutes - more dynamic bookings
    refetchOnWindowFocus: true,
  })

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

