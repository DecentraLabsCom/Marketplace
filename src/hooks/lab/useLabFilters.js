/**
 * Hook for managing lab filtering and search functionality
 * Centralizes search state, filtering logic, and concurrent search
 */
import { useState, useCallback, useMemo, useRef, useDeferredValue } from 'react'

/**
 * Custom hook for lab filtering and search
 * @param {Array} labs - Array of lab objects
 * @param {Object} userBookingsData - User bookings data from useUserBookingsForMarket
 * @param {boolean} isLoggedIn - User login status
 * @param {boolean} bookingsLoading - Whether bookings are still loading
 * @param {boolean} isHydrated - Client hydration status
 * @returns {Object} Filter state, handlers, and filtered results
 */
export function useLabFilters(labs = [], userBookingsData = null, isLoggedIn = false, bookingsLoading = false, isHydrated = true) {
  const searchInputRef = useRef(null)
  
  // Filter state
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [selectedPrice, setSelectedPrice] = useState("Sort by Price")
  const [selectedProvider, setSelectedProvider] = useState("All")
  const [selectedFilter, setSelectedFilter] = useState("Keyword")
  const [showUnlisted, setShowUnlisted] = useState(false)
  
  // New Search State: searchTerm is immediate, deferredSearchTerm is for the heavy filtering
  const [searchTerm, setSearchTerm] = useState("")
  const deferredSearchTerm = useDeferredValue(searchTerm)

  // Get all lab categories and providers using memoization
  const categories = useMemo(() => {
    if (!labs || labs.length === 0) return []
    const uniqueCategories = new Set()
    labs.forEach(lab => {
      if (Array.isArray(lab.category)) {
        lab.category.forEach(c => { if (c) uniqueCategories.add(c) })
      } else if (lab.category) {
        uniqueCategories.add(lab.category)
      }
    })
    return Array.from(uniqueCategories).sort()
  }, [labs])

  const providers = useMemo(() => {
    if (!labs || labs.length === 0) return []
    const uniqueProviders = new Set()
    labs.forEach(lab => {
      if (lab.provider) uniqueProviders.add(lab.provider)
    })
    return Array.from(uniqueProviders).sort()
  }, [labs])

  // Main filtering logic using useMemo for performance and stability
  const searchFilteredLabs = useMemo(() => {
    if (!labs || labs.length === 0) {
      return []
    }
    
    let filtered = labs
    
    // Category filter
    if (selectedCategory !== "All") {
      filtered = filtered.filter((lab) => {
        if (Array.isArray(lab.category)) return lab.category.includes(selectedCategory)
        return lab.category === selectedCategory
      })
    }
    
    // Price sorting
    if (selectedPrice === "Low to High") {
      filtered = [...filtered].sort((a, b) => a.price - b.price)
    } else if (selectedPrice === "High to Low") {
      filtered = [...filtered].sort((a, b) => b.price - a.price)
    }
    
    // Provider filter
    if (selectedProvider !== "All") {
      filtered = filtered.filter((lab) => lab.provider === selectedProvider)
    }

    // Apply text search based on selected filter type using the DEFERRED term
    if (deferredSearchTerm) {
      const term = deferredSearchTerm.toLowerCase()
      filtered = filtered.filter((lab) => {
        switch (selectedFilter) {
          case "Keyword":
            return (Array.isArray(lab.keywords) 
                    ? lab.keywords.some(keyword => keyword?.toLowerCase().includes(term))
                    : lab.keywords?.toLowerCase().includes(term)) ||
                   lab.name?.toLowerCase().includes(term) ||
                   lab.description?.toLowerCase().includes(term)
          case "Name":
            return lab.name?.toLowerCase().includes(term)
          default:
            return true
        }
      })
    }

    return filtered
  }, [
    labs, 
    selectedCategory, 
    selectedPrice, 
    selectedProvider, 
    selectedFilter, 
    deferredSearchTerm // Dependency updated
  ])

  // Separate memo for active booking marking to minimize re-renders
  const enrichedLabs = useMemo(() => {
    return searchFilteredLabs.map(lab => ({
      ...lab,
      hasActiveBooking: isLoggedIn && !bookingsLoading && userBookingsData?.hasBookingInLab?.(lab.id)
    }))
  }, [searchFilteredLabs, isLoggedIn, bookingsLoading, userBookingsData])

  // Reset filters function
  const resetFilters = useCallback(() => {
    setSelectedCategory("All")
    setSelectedPrice("Sort by Price")
    setSelectedProvider("All")
    setSelectedFilter("Keyword")
    setShowUnlisted(false)
    setSearchTerm("") // Reset the immediate search state
    if (searchInputRef.current) {
      searchInputRef.current.value = ""
    }
  }, [])

  return {
    // State
    selectedCategory,
    selectedPrice,
    selectedProvider,
    selectedFilter,
    showUnlisted,
    searchFilteredLabs: enrichedLabs,
    searchTerm, // Immediate value for the input
    searchDebounce: deferredSearchTerm, // Deferred value for the heavy filtering
    isStale: searchTerm !== deferredSearchTerm, // Indicates if the filter is lagging behind the input
    
    // Setters
    setSelectedCategory,
    setSelectedPrice,
    setSelectedProvider,
    setSelectedFilter,
    setShowUnlisted,
    setSearchTerm, // Exported to be used by the input onChange
    
    // Derived data
    categories,
    providers,
    
    // Refs
    searchInputRef,
    
    // Actions
    resetFilters
  }
}