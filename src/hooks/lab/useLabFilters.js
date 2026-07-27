/**
 * Hook for managing lab filtering and search functionality
 * Centralizes search state, filtering logic, and debounced search
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { getResourceType } from '@/utils/resourceType'

/**
 * Custom hook for lab filtering and search
 * @param {Array} labs - Array of lab objects
 * @param {Object} userBookingsData - User bookings data from useUserBookingsForMarket (with Set and helper methods)
 * @param {boolean} isLoggedIn - User login status
 * @param {boolean} bookingsLoading - Whether bookings are still loading
 * @returns {Object} Filter state, handlers, and filtered results
 * @returns {string} returns.selectedCategory - Currently selected category filter
 * @returns {string} returns.selectedSort - Currently selected catalogue sorting
 * @returns {string} returns.selectedProvider - Currently selected provider filter
 * @returns {string} returns.selectedFilter - Currently selected search filter type
 * @returns {boolean} returns.showUnlisted - Whether to show unlisted labs
 * @returns {Array} returns.searchFilteredLabs - Filtered and enriched labs array
 * @returns {string} returns.searchDebounce - Current debounced search term
 * @returns {Function} returns.setSelectedCategory - Set category filter function
 * @returns {Function} returns.setSelectedSort - Set catalogue sorting function
 * @returns {Function} returns.setSelectedProvider - Set provider filter function
 * @returns {Function} returns.setSelectedFilter - Set search filter type function
 * @returns {Function} returns.setShowUnlisted - Set show unlisted labs function
 * @returns {Array} returns.categories - Available categories for filtering
 * @returns {Array} returns.providers - Available providers for filtering
 * @returns {Object} returns.searchInputRef - Ref for search input element
 */
export function useLabFilters(labs = [], userBookingsData = null, isLoggedIn = false, bookingsLoading = false, isHydrated = true, now = null) {
  const searchInputRef = useRef(null)
  const lastAttachedInput = useRef(null)
  
  // Filter state
  const [selectedCategory, setSelectedCategory] = useState("All")
  const [selectedSort, setSelectedSort] = useState("relevance")
  const [selectedProvider, setSelectedProvider] = useState("All")
  const [selectedFilter, setSelectedFilter] = useState("Keyword")
  const [selectedResourceType, setSelectedResourceType] = useState("All")
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
    
    // Provider filter
    if (selectedProvider !== "All") {
      filtered = filtered.filter((lab) => lab.provider === selectedProvider)
    }

    // Resource type filter
    if (selectedResourceType !== "All") {
      filtered = filtered.filter((lab) => {
        const rt = getResourceType(lab)
        return rt === selectedResourceType
      })
    }

    // Apply text search based on selected filter type
    if (searchDebounce) {
      filtered = filtered.filter((lab) => {
        switch (selectedFilter) {
          case "Keyword":
            return [
              lab.name,
              lab.provider,
              ...(Array.isArray(lab.category) ? lab.category : [lab.category]),
              ...(Array.isArray(lab.keywords) ? lab.keywords : [lab.keywords]),
              lab.description,
            ]
              .filter((value) => typeof value === 'string')
              .some((value) => value.toLowerCase().includes(searchDebounce))
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
    selectedProvider, 
    selectedFilter, 
    selectedResourceType,
    searchDebounce
  ])

  const sortedLabs = useMemo(() => {
    if (selectedSort === "relevance") return searchFilteredLabs

    const numericValue = (value) => {
      const number = Number(value)
      return Number.isFinite(number) ? number : null
    }
    const compareNullableNumbers = (left, right, direction) => {
      if (left === null && right === null) return 0
      if (left === null) return 1
      if (right === null) return -1
      if (left === right) return 0
      return left > right ? direction : -direction
    }
    const compareIds = (left, right) => numericValue(left.id) - numericValue(right.id)

    return [...searchFilteredLabs].sort((left, right) => {
      if (selectedSort === 'price_asc' || selectedSort === 'price_desc') {
        const direction = selectedSort === 'price_desc' ? -1 : 1
        const comparison = compareNullableNumbers(numericValue(left.price), numericValue(right.price), direction)
        if (comparison !== 0) return comparison
      } else if (selectedSort === 'rating_asc' || selectedSort === 'rating_desc') {
        const direction = selectedSort === 'rating_desc' ? -1 : 1
        const comparison = compareNullableNumbers(
          numericValue(left.rating?.score ?? left.reputation?.score),
          numericValue(right.rating?.score ?? right.reputation?.score),
          direction,
        )
        if (comparison !== 0) return comparison
      } else if (selectedSort === 'age_newest' || selectedSort === 'age_oldest') {
        const direction = selectedSort === 'age_newest' ? -1 : 1
        const comparison = compareNullableNumbers(numericValue(left.createdAt), numericValue(right.createdAt), direction)
        if (comparison !== 0) return comparison
      } else if (selectedSort === 'name_asc' || selectedSort === 'name_desc') {
        const direction = selectedSort === 'name_desc' ? -1 : 1
        const leftName = String(left.name || '').toLocaleLowerCase()
        const rightName = String(right.name || '').toLocaleLowerCase()
        if (leftName !== rightName) return leftName > rightName ? direction : -direction
      }

      return compareIds(left, right)
    })
  }, [searchFilteredLabs, selectedSort])

  // Separate memo for active booking marking to minimize re-renders
  const enrichedLabs = useMemo(() => {
    return sortedLabs.map(lab => ({
      ...lab,
      hasActiveBooking: isLoggedIn && !bookingsLoading && userBookingsData?.hasBookingInLab?.(lab.id),
      activeBookingKey: isLoggedIn && !bookingsLoading ? (userBookingsData?.getActiveBookingKey?.(lab.id) || null) : null,
    }))
  }, [sortedLabs, isLoggedIn, bookingsLoading, userBookingsData, now])

  return {
    // State
    selectedCategory,
    selectedSort,
    selectedProvider,
    selectedFilter,
    selectedResourceType,
    showUnlisted,
    searchFilteredLabs: enrichedLabs, // Return enriched labs with active booking marks
    searchDebounce,
    
    // Setters
    setSelectedCategory,
    setSelectedSort,
    setSelectedProvider,
    setSelectedFilter,
    setSelectedResourceType,
    setShowUnlisted,
    
    // Derived data
    categories,
    providers,
    
    // Refs
    searchInputRef,
    
  }
}
