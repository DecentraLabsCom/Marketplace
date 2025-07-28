/**
 * Hook for managing lab filtering and search functionality
 * Centralizes search state, filtering logic, and debounced search
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import isBookingActive from '@/utils/booking/isBookingActive'

/**
 * Custom hook for lab filtering and search
 * @param {Array} labs - Array of lab objects
 * @param {Array} userBookings - Array of user booking objects
 * @param {boolean} isLoggedIn - User login status
 * @returns {Object} Filter state, handlers, and filtered results
 */
export function useLabFilters(labs = [], userBookings = [], isLoggedIn = false) {
  const searchInputRef = useRef(null)
  
  // Filter state
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [selectedPrice, setSelectedPrice] = useState("Sort by Price")
  const [selectedProvider, setSelectedProvider] = useState("All")
  const [selectedFilter, setSelectedFilter] = useState("Keyword")
  const [searchFilteredLabs, setSearchFilteredLabs] = useState([])
  const [searchDebounce, setSearchDebounce] = useState("")

  // Get all lab categories and providers using memoization
  const categories = useMemo(() => {
    if (!labs || labs.length === 0) return []
    const uniqueCategories = new Set()
    labs.forEach(lab => {
      if (lab.category) uniqueCategories.add(lab.category)
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
  useEffect(() => {
    const handleSearchInput = () => {
      const value = searchInputRef.current?.value?.toLowerCase() || ""
      const timeoutId = setTimeout(() => {
        setSearchDebounce(value)
      }, 300)

      return () => clearTimeout(timeoutId)
    }

    const searchInput = searchInputRef.current
    if (searchInput) {
      searchInput.addEventListener('input', handleSearchInput)
      return () => searchInput.removeEventListener('input', handleSearchInput)
    }
  }, [])

  // Optimized search/filter with useMemo
  const search = useCallback(() => {
    if (!labs) return
    
    let filtered = labs
    if (selectedCategory !== "All") {
      filtered = filtered.filter((lab) => lab.category === selectedCategory)
    }
    if (selectedPrice === "Low to High") {
      filtered = [...filtered].sort((a, b) => a.price - b.price)
    } else if (selectedPrice === "High to Low") {
      filtered = [...filtered].sort((a, b) => b.price - a.price)
    }
    if (selectedProvider !== "All") {
      filtered = filtered.filter((lab) => lab.provider === selectedProvider)
    }

    // Apply text search based on selected filter type
    if (searchDebounce) {
      filtered = filtered.filter((lab) => {
        switch (selectedFilter) {
          case "Keyword":
            return lab.keywords?.toLowerCase().includes(searchDebounce) ||
                   lab.name?.toLowerCase().includes(searchDebounce) ||
                   lab.description?.toLowerCase().includes(searchDebounce)
          case "Name":
            return lab.name?.toLowerCase().includes(searchDebounce)
          case "Provider":
            return lab.provider?.toLowerCase().includes(searchDebounce)
          case "Category":
            return lab.category?.toLowerCase().includes(searchDebounce)
          default:
            return true
        }
      })
    }

    // Mark labs with active bookings
    const enrichedLabs = filtered.map(lab => ({
      ...lab,
      hasActiveBooking: isLoggedIn && userBookings.some(booking => 
        booking.labId === lab.id && isBookingActive(booking)
      )
    }))

    setSearchFilteredLabs(enrichedLabs)
  }, [labs, selectedCategory, selectedPrice, selectedProvider, selectedFilter, searchDebounce, userBookings, isLoggedIn])

  // Effect to trigger search when dependencies change
  useEffect(() => {
    search()
  }, [search])

  // Reset filters function
  const resetFilters = useCallback(() => {
    setSelectedCategory("All")
    setSelectedPrice("Sort by Price")
    setSelectedProvider("All")
    setSelectedFilter("Keyword")
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
    searchFilteredLabs,
    searchDebounce,
    
    // Setters
    setSelectedCategory,
    setSelectedPrice,
    setSelectedProvider,
    setSelectedFilter,
    
    // Derived data
    categories,
    providers,
    
    // Refs
    searchInputRef,
    
    // Actions
    search,
    resetFilters
  }
}
