/**
 * Lab filtering interface component
 * Provides search and filter controls for the marketplace
 */
import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'

/**
 * Lab filters component for marketplace search and filtering
 * @param {Object} props
 * @param {Array} props.categories - Available lab categories
 * @param {Array} props.providers - Available lab providers
 * @param {string} props.selectedCategory - Currently selected category
 * @param {string} props.selectedPrice - Currently selected price sort
 * @param {string} props.selectedProvider - Currently selected provider
 * @param {string} props.selectedFilter - Currently selected search filter type
 * @param {Function} props.onCategoryChange - Category selection handler
 * @param {Function} props.onPriceChange - Price sort handler
 * @param {Function} props.onProviderChange - Provider selection handler
 * @param {Function} props.onFilterChange - Search filter type handler
 * @param {Function} props.onReset - Reset filters handler
 * @param {Object} props.searchInputRef - Ref for search input
 * @param {boolean} props.loading - Loading state
 */
export default function LabFilters({
  categories = [],
  providers = [],
  selectedCategory,
  selectedPrice,
  selectedProvider,
  selectedFilter,
  onCategoryChange,
  onPriceChange,
  onProviderChange,
  onFilterChange,
  onReset,
  searchInputRef,
  loading = false
}) {
  // Prevent hydration mismatch by ensuring consistent initial render
  const [isHydrated, setIsHydrated] = useState(false)
  
  useEffect(() => {
    setIsHydrated(true)
  }, [])
  
  // Use consistent loading state during hydration
  const effectiveLoading = isHydrated ? loading : false
  
  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      // Trigger search on Enter
      const value = searchInputRef.current?.value?.toLowerCase() || "";
      // The search logic is handled by the parent component through the ref
    }
  }

  const handleSearch = () => {
    // Force search by triggering input event
    if (searchInputRef.current) {
      const event = new Event('input', { bubbles: true });
      searchInputRef.current.dispatchEvent(event);
    }
  }

  const handlePriceClick = () => {
    if (selectedPrice === "Sort by Price") {
      onPriceChange("Low to High");
    } else if (selectedPrice === "Low to High") {
      onPriceChange("High to Low");
    } else {
      onPriceChange("Sort by Price");
    }
  }

  return (
    <section className="mb-6 flex flex-col md:flex-row md:space-x-4 space-y-2 md:space-y-0 items-stretch md:items-center justify-center w-full">
      {/* Filters */}
      <div className="flex flex-row w-full md:w-auto gap-2">
        <div className="w-1/2 md:w-auto">
          <label htmlFor="category-filter" className="sr-only">
            Filter by Category
          </label>
          <select 
            id="category-filter" 
            onChange={(e) => onCategoryChange(e.target.value)}
            value={selectedCategory} 
            className="pl-4 pr-2 py-2 border rounded bg-white text-gray-800 shadow-md hover:bg-header-bg cursor-pointer w-full"
            disabled={effectiveLoading}
          >
            <option value="All">All Categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
        <div className="w-1/2 md:w-auto">
          <label htmlFor="provider-filter" className="sr-only">
            Filter by Provider
          </label>
          <select 
            id="provider-filter" 
            onChange={(e) => onProviderChange(e.target.value)}
            value={selectedProvider} 
            className="px-4 py-2 border rounded bg-white text-gray-800 shadow-md hover:bg-header-bg cursor-pointer w-full"
            disabled={effectiveLoading}
          >
            <option value="All">All Providers</option>
            {providers.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Search Bar */}
      <div className="w-full md:w-auto">
        <div className="relative">
          <div className="absolute top-1.5 left-1 flex items-center">
            <label htmlFor="search-bar" className="sr-only">
              Search Labs
            </label>
            <select 
              onChange={(e) => onFilterChange(e.target.value)} 
              value={selectedFilter}
              className="bg-white rounded border border-transparent py-1 px-1.5 flex items-center text-sm transition-all text-slate-600 hover:bg-header-bg cursor-pointer"
              disabled={effectiveLoading}
            >
              <option value="Keyword">Keyword</option>
              <option value="Name">Name</option>
            </select>
            <div className="h-6 border-l border-slate-200 ml-1.5" />
          </div>
          <input 
            ref={searchInputRef} 
            type="text" 
            placeholder="Type here..." 
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent placeholder:text-slate-500 text-header-bg text-sm border border-slate-200 rounded-md pl-28 pr-24 py-2 transition duration-300 ease focus:outline-none focus:border-header-bg shadow-sm focus:shadow"
            disabled={effectiveLoading}
          />
          <button 
            onClick={handleSearch} 
            className="absolute top-1 right-1 flex items-center rounded bg-brand py-1 px-2.5 border border-transparent text-center text-sm text-white transition-all shadow-sm hover:shadow focus:bg-slate-700 focus:shadow-none active:bg-slate-700 hover:bg-slate-700 active:shadow-none disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none" 
            type="button"
            disabled={effectiveLoading}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="size-4 mr-1.5">
              <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />
            </svg>
            Search
          </button>
        </div>
      </div>

      {/* Price sorting */}
      <div className="w-full md:w-auto flex justify-center md:justify-start items-center">
        <button 
          onClick={handlePriceClick} 
          value={selectedPrice}
          className="w-[130px] py-[7px] border border-header-bg rounded bg-brand text-white shadow-md hover:bg-slate-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={effectiveLoading}
        >
          {selectedPrice}
        </button>
      </div>
    </section>
  )
}

LabFilters.propTypes = {
  categories: PropTypes.arrayOf(PropTypes.string),
  providers: PropTypes.arrayOf(PropTypes.string),
  selectedCategory: PropTypes.string.isRequired,
  selectedPrice: PropTypes.string.isRequired,
  selectedProvider: PropTypes.string.isRequired,
  selectedFilter: PropTypes.string.isRequired,
  onCategoryChange: PropTypes.func.isRequired,
  onPriceChange: PropTypes.func.isRequired,
  onProviderChange: PropTypes.func.isRequired,
  onFilterChange: PropTypes.func.isRequired,
  onReset: PropTypes.func.isRequired,
  searchInputRef: PropTypes.object.isRequired,
  loading: PropTypes.bool
}
