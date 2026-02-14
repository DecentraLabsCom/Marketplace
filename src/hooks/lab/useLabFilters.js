/**
 * Hook for managing lab filtering and search functionality
 * Centralizes search state, filtering logic, and debounced search
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'

/**
 * Custom hook for lab filtering and search
 * @param {Array} labs - Array of lab objects
 * @param {Object} userBookingsData - User bookings data from useUserBookingsForMarket (with Set and helper methods)
 * @param {boolean} isLoggedIn - User login status
 * @param {boolean} bookingsLoading - Whether bookings are still loading
 * @returns {Object} Filter state, handlers, and filtered results
 * @returns {string} returns.selectedCategory - Currently selected category filter
 * @returns {string} returns.selectedPrice - Currently selected price sorting
 * @returns {string} returns.selectedProvider - Currently selected provider filter
 * @returns {string} returns.selectedFilter - Currently selected search filter type
 * @returns {boolean} returns.showUnlisted - Whether to show unlisted labs
 * @returns {Array} returns.searchFilteredLabs - Filtered and enriched labs array
 * @returns {string} returns.searchDebounce - Current debounced search term
 * @returns {Function} returns.setSelectedCategory - Set category filter function
 * @returns {Function} returns.setSelectedPrice - Set price sorting function
 * @returns {Function} returns.setSelectedProvider - Set provider filter function
 * @returns {Function} returns.setSelectedFilter - Set search filter type function
 * @returns {Function} returns.setShowUnlisted - Set show unlisted labs function
 * @returns {Array} returns.categories - Available categories for filtering
 * @returns {Array} returns.providers - Available providers for filtering
 * @returns {Object} returns.searchInputRef - Ref for search input element
 * @returns {Function} returns.resetFilters - Reset all filters function
 */
export function useLabFilters(labs = [], userBookingsData = null, isLoggedIn = false, bookingsLoading = false, isHydrated = true) {
  const searchInputRef = useRef(null)
  const lastAttachedInput = useRef(null)
  
  // Filter state
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [selectedPrice, setSelectedPrice] = useState("Sort by Price")
  const [selectedProvider, setSelectedProvider] = useState("All")
  const [selectedFilter, setSelectedFilter] = useState("Keyword")
  const [showUnlisted, setShowUnlisted] = useState(false)
  const [searchDebounce, setSearchDebounce] = useState("")

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

  // Debounced search effect for better performance
  // NOTE: depends on `isHydrated` so the listener is attached after the input mounts in the client
  useEffect(() => {
    let timeoutId

    if (!isHydrated) {
      return
    }

    const handleSearchInput = (event) => {
      const value = (event?.target?.value ?? searchInputRef.current?.value ?? "").toLowerCase()

      // Clear existing timeout
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      // Set new timeout
      timeoutId = setTimeout(() => {
        setSearchDebounce(value)
      }, 300)
    }

    const inputEl = searchInputRef.current

    // Attach only when the input element exists
    if (inputEl) {
      // Avoid double-attaching to the same element
      if (lastAttachedInput.current === inputEl) {
        return () => {
          if (timeoutId) clearTimeout(timeoutId)
        }
      }

      inputEl.addEventListener('input', handleSearchInput)
      lastAttachedInput.current = inputEl

      return () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        inputEl.removeEventListener('input', handleSearchInput)
        lastAttachedInput.current = null
      }
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [isHydrated, searchInputRef])

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

    // Apply text search based on selected filter type
    if (searchDebounce) {
      filtered = filtered.filter((lab) => {
        switch (selectedFilter) {
          case "Keyword":
            return (Array.isArray(lab.keywords) 
                     ? lab.keywords.some(keyword => keyword?.toLowerCase().includes(searchDebounce))
                     : lab.keywords?.toLowerCase().includes(searchDebounce)) ||
                   lab.name?.toLowerCase().includes(searchDebounce) ||
                   lab.description?.toLowerCase().includes(searchDebounce)
          case "Name":
            return lab.name?.toLowerCase().includes(searchDebounce)
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
    searchDebounce
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
    setSearchDebounce("")
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
    searchFilteredLabs: enrichedLabs, // Return enriched labs with active booking marks
    searchDebounce,
    
    // Setters
    setSelectedCategory,
    setSelectedPrice,
    setSelectedProvider,
    setSelectedFilter,
    setShowUnlisted,
    
    // Derived data
    categories,
    providers,
    
    // Refs
    searchInputRef,
    
    // Actions
    resetFilters
  }
}
