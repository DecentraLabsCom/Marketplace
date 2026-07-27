/**
 * Lab filtering interface component
 * Provides search, grouped catalogue filters, and sorting controls.
 */
import React, { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { MARKET_SORT_OPTIONS } from '@/utils/market/marketSorts'

const selectClassName = 'w-full rounded border border-slate-200 bg-white px-4 py-2 text-gray-800 shadow-md hover:bg-header-bg cursor-pointer'

/**
 * Lab filters component for marketplace search and filtering
 * @param {Object} props
 * @param {Array} props.categories - Available lab categories
 * @param {Array} props.providers - Available lab providers
 * @param {string} props.selectedCategory - Currently selected category
 * @param {string} props.selectedSort - Currently selected catalogue sort
 * @param {string} props.selectedProvider - Currently selected provider
 * @param {string} props.selectedFilter - Currently selected search filter type
 * @param {string} props.selectedResourceType - Currently selected resource type filter ('All', 'lab', 'fmu')
 * @param {boolean} props.showUnlisted - Whether to include unlisted labs
 * @param {Function} props.onCategoryChange - Category selection handler
 * @param {Function} props.onSortChange - Catalogue sort handler
 * @param {Function} props.onProviderChange - Provider selection handler
 * @param {Function} props.onFilterChange - Search filter type handler
 * @param {Function} props.onResourceTypeChange - Resource type filter handler
 * @param {Function} props.onShowUnlistedChange - Include unlisted labs handler
 * @param {Object} props.searchInputRef - Ref for search input
 * @param {boolean} props.loading - Loading state
 */
export default function LabFilters({
  categories = [],
  providers = [],
  selectedCategory,
  selectedSort = 'relevance',
  selectedProvider,
  selectedFilter,
  selectedResourceType = 'All',
  showUnlisted = false,
  onCategoryChange,
  onSortChange = () => {},
  onProviderChange,
  onFilterChange,
  onResourceTypeChange,
  onShowUnlistedChange,
  searchInputRef,
  loading = false,
}) {
  // Prevent hydration mismatch by ensuring consistent initial render
  const [isHydrated, setIsHydrated] = useState(false)
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  // Use consistent loading state during hydration
  const effectiveLoading = isHydrated ? loading : false
  const activeFilterCount = [
    selectedCategory !== 'All',
    selectedProvider !== 'All',
    selectedResourceType !== 'All',
    showUnlisted,
  ].filter(Boolean).length

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleSearch()
    }
  }

  const handleSearch = () => {
    // Force search by triggering input event
    if (searchInputRef?.current) {
      const event = new Event('input', { bubbles: true })
      searchInputRef.current.dispatchEvent(event)
    }
  }

  const handleFilterReset = () => {
    onCategoryChange('All')
    onProviderChange('All')
    onResourceTypeChange?.('All')
    onShowUnlistedChange(false)
  }

  return (
    <section className="mb-6 w-full">
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,42rem)_minmax(0,1fr)] lg:items-end">
        {/* Search Bar */}
        <div className="min-w-0 lg:col-start-2 lg:row-start-1">
          <div className="relative">
            <div className="absolute top-1 left-1 flex items-center">
              <label htmlFor="search-filter" className="sr-only">
                Search filter
              </label>
              <select
                id="search-filter"
                onChange={(event) => onFilterChange(event.target.value)}
                value={selectedFilter}
                className="flex items-center rounded border border-transparent bg-white py-1 pl-1.5 pr-7 text-sm text-slate-600 transition-all hover:bg-header-bg"
                disabled={effectiveLoading}
              >
                <option value="Keyword">Keyword</option>
                <option value="Name">Name</option>
              </select>
              <div className="ml-1.5 h-6 border-l border-slate-200" />
            </div>
            <label htmlFor="search-bar" className="sr-only">
              Search labs
            </label>
            <input
              ref={searchInputRef}
              id="search-bar"
              type="text"
              placeholder="Type here..."
              onKeyDown={handleKeyDown}
              className="w-full rounded-md border border-slate-200 bg-transparent py-2 pl-28 pr-24 text-sm text-header-bg shadow-sm transition duration-300 ease placeholder:text-slate-500 focus:border-header-bg focus:outline-none focus:shadow"
              disabled={effectiveLoading}
            />
            <button
              onClick={handleSearch}
              className="absolute top-1 right-1 flex items-center rounded border border-transparent bg-brand px-2.5 py-1 text-center text-sm text-white shadow-sm transition-all hover:bg-slate-700 hover:shadow focus:bg-slate-700 focus:shadow-none active:bg-slate-700 active:shadow-none disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none"
              type="button"
              disabled={effectiveLoading}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="mr-1.5 size-4" aria-hidden="true">
                <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />
              </svg>
              Search
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center lg:col-start-3 lg:row-start-1 lg:justify-self-end">
          {/* Grouped filters */}
          <button
            type="button"
            aria-expanded={isFilterMenuOpen}
            aria-controls="market-filter-panel"
            onClick={() => setIsFilterMenuOpen((open) => !open)}
            disabled={effectiveLoading}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded border border-header-bg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-md transition-colors hover:bg-hover-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="size-4" aria-hidden="true">
              <path d="M3 5.25A2.25 2.25 0 0 1 5.25 3h9.5A2.25 2.25 0 0 1 17 5.25v.38a2.25 2.25 0 0 1-.66 1.59l-3.59 3.59v3.94a1.25 1.25 0 0 1-.69 1.12l-2 1A1.25 1.25 0 0 1 8.25 15.75v-4.94L4.66 7.22A2.25 2.25 0 0 1 4 5.63v-.38ZM5.25 4.5a.75.75 0 0 0-.75.75v.38c0 .2.08.39.22.53l3.8 3.8c.14.14.22.33.22.53v5.26l1.5-.75v-4.51c0-.2.08-.39.22-.53l3.8-3.8a.75.75 0 0 0 .22-.53v-.38a.75.75 0 0 0-.75-.75h-9.5Z" />
            </svg>
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-white px-1.5 py-0.5 text-xs font-bold text-brand">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Sorting */}
          <div className="min-w-0 sm:min-w-52">
            <label htmlFor="sort-labs" className="sr-only">
              Sort labs
            </label>
            <select
              id="sort-labs"
              value={selectedSort}
              onChange={(event) => onSortChange(event.target.value)}
              className={selectClassName}
              disabled={effectiveLoading}
            >
              {MARKET_SORT_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isFilterMenuOpen && (
        <div
          id="market-filter-panel"
          role="region"
          aria-label="Filter options"
          className="mt-3 rounded-lg border border-slate-200 bg-white p-4 shadow-md"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="category-filter" className="mb-1 block text-sm font-semibold text-hover-dark">
                Filter by category
              </label>
              <select
                id="category-filter"
                onChange={(event) => onCategoryChange(event.target.value)}
                value={selectedCategory}
                className={selectClassName}
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

            <div>
              <label htmlFor="provider-filter" className="mb-1 block text-sm font-semibold text-hover-dark">
                Filter by provider
              </label>
              <select
                id="provider-filter"
                onChange={(event) => onProviderChange(event.target.value)}
                value={selectedProvider}
                className={selectClassName}
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

            <div>
              <label htmlFor="listing-filter" className="mb-1 block text-sm font-semibold text-hover-dark">
                Filter by listing
              </label>
              <select
                id="listing-filter"
                onChange={(event) => onShowUnlistedChange(event.target.value === 'all')}
                value={showUnlisted ? 'all' : 'listed'}
                className={selectClassName}
                disabled={effectiveLoading}
              >
                <option value="listed">Listed labs</option>
                <option value="all">All labs</option>
              </select>
            </div>

            <div>
              <label htmlFor="resource-type-filter" className="mb-1 block text-sm font-semibold text-hover-dark">
                Filter by type
              </label>
              <select
                id="resource-type-filter"
                onChange={(event) => onResourceTypeChange?.(event.target.value)}
                value={selectedResourceType}
                className={selectClassName}
                disabled={effectiveLoading}
              >
                <option value="All">Modality</option>
                <option value="lab">Real</option>
                <option value="fmu">Simulated</option>
              </select>
            </div>
          </div>

          {activeFilterCount > 0 && (
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
              <span className="text-xs text-slate-500">
                {activeFilterCount} active {activeFilterCount === 1 ? 'filter' : 'filters'}
              </span>
              <button
                type="button"
                onClick={handleFilterReset}
                className="text-sm font-semibold text-brand underline-offset-2 hover:text-hover-dark hover:underline disabled:opacity-50"
                disabled={effectiveLoading}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

LabFilters.propTypes = {
  categories: PropTypes.arrayOf(PropTypes.string),
  providers: PropTypes.arrayOf(PropTypes.string),
  selectedCategory: PropTypes.string.isRequired,
  selectedSort: PropTypes.string,
  selectedProvider: PropTypes.string.isRequired,
  selectedFilter: PropTypes.string.isRequired,
  showUnlisted: PropTypes.bool,
  onCategoryChange: PropTypes.func.isRequired,
  onSortChange: PropTypes.func,
  onProviderChange: PropTypes.func.isRequired,
  onFilterChange: PropTypes.func.isRequired,
  onResourceTypeChange: PropTypes.func,
  onShowUnlistedChange: PropTypes.func.isRequired,
  selectedResourceType: PropTypes.string,
  searchInputRef: PropTypes.object.isRequired,
  loading: PropTypes.bool,
}
