/**
 * Main marketplace component displaying available labs with search and filtering
 * Central hub for users to discover and access laboratory resources
 * Integrates with user authentication, bookings, and lab data management
 * @returns {JSX.Element} Complete marketplace interface with lab grid, search, and user-specific features
 */
"use client";
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'

import { useUser } from '@/context/UserContext'
import { useAllLabsQuery } from '@/hooks/lab/useLabs'
import { useUserBookingsQuery } from '@/hooks/booking/useBookings'
import LabCard from '@/components/labs/LabCard'
import { LabCardGridSkeleton } from '@/components/skeletons'
import isBookingActive from '@/utils/booking/isBookingActive'

export default function Market() {
  const searchInputRef = useRef(null);
  const { isLoggedIn, address, isSSO } = useUser();
  
  // 🚀 React Query for labs
  const { 
    data: labs = [], 
    isLoading: loading, 
    isError: labsError,
    error: labsErrorDetails 
  } = useAllLabsQuery({
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60 * 1000, // Auto-refetch every 5 minutes
  });
  
  // 🚀 React Query for user bookings
  const { 
    data: userBookings = [], 
    isLoading: bookingsLoading 
  } = useUserBookingsQuery(address, null, null, {
    enabled: !!address && isLoggedIn,
    staleTime: 2 * 60 * 1000, // 2 minutes - more dynamic bookings
    refetchOnWindowFocus: true,
  });
  
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedPrice, setSelectedPrice] = useState("Sort by Price");
  const [selectedProvider, setSelectedProvider] = useState("All");
  const [selectedFilter, setSelectedFilter] = useState("Keyword");
  const [searchFilteredLabs, setSearchFilteredLabs] = useState([]);
  const [searchDebounce, setSearchDebounce] = useState("");

  // Get all lab categories and providers using memoization
  const categories = useMemo(() => {
    if (!labs || labs.length === 0) return [];
    const uniqueCategories = new Set();
    labs.forEach(lab => {
      if (lab.category) uniqueCategories.add(lab.category);
    });
    return Array.from(uniqueCategories).sort();
  }, [labs]);

  const providers = useMemo(() => {
    if (!labs || labs.length === 0) return [];
    const uniqueProviders = new Set();
    labs.forEach(lab => {
      if (lab.provider) uniqueProviders.add(lab.provider);
    });
    return Array.from(uniqueProviders).sort();
  }, [labs]);

  // Debounced search effect for better performance
  useEffect(() => {
    const handleSearchInput = () => {
      const value = searchInputRef.current?.value?.toLowerCase() || "";
      const timeoutId = setTimeout(() => {
        setSearchDebounce(value);
      }, 300);

      return () => clearTimeout(timeoutId);
    };

    const searchInput = searchInputRef.current;
    if (searchInput) {
      searchInput.addEventListener('input', handleSearchInput);
      return () => searchInput.removeEventListener('input', handleSearchInput);
    }
  }, []);

  // Optimized search/filter with useMemo
  const search = useCallback(() => {
    if (!labs) return;
    
    let filtered = labs;
    if (selectedCategory !== "All") {
      filtered = filtered.filter((lab) => lab.category === selectedCategory);
    }
    if (selectedPrice === "Low to High") {
      filtered = [...filtered].sort((a, b) => a.price - b.price);
    } else if (selectedPrice === "High to Low") {
      filtered = [...filtered].sort((a, b) => b.price - a.price);
    }
    if (selectedProvider !== "All") {
      filtered = filtered.filter((lab) => lab.provider === selectedProvider);
    }
    
    // Use debounced search value
    const value = searchDebounce;
    if (selectedFilter === "Keyword" && value) {
      filtered = filtered.filter((lab) =>
        lab.keywords?.some((kw) => kw.toLowerCase().includes(value))
      );
    } else if (selectedFilter === "Name" && value) {
      filtered = filtered.filter((lab) =>
        lab.name.toLowerCase().includes(value)
      );
    }
    setSearchFilteredLabs(filtered);
  }, [labs, selectedCategory, selectedPrice, selectedProvider, selectedFilter, searchDebounce]);

  // Apply the search every time the filter dependencies change directly
  useEffect(() => {
    search();
  }, [labs, selectedCategory, selectedPrice, selectedProvider, selectedFilter, searchDebounce]);

  // Enable search on Enter key press
  const handleKeyDown = useCallback((event) => {
    if (event.key === "Enter") {
      const value = searchInputRef.current?.value?.toLowerCase() || "";
      setSearchDebounce(value);
    }
  }, []);

  // Optimized search trigger - also handles manual search button
  const handleSearch = useCallback(() => {
    const value = searchInputRef.current?.value?.toLowerCase() || "";
    setSearchDebounce(value);
  }, []);

  // Remove keyword and name filter when deleting input value
  const handleInputChange = useCallback((event) => {
    if (!event.target.value) {
      setSearchDebounce("");
    }
  }, []);

  const handlePriceClick = () => {
    if (selectedPrice === "Sort by Price") {
      setSelectedPrice("Low to High");
    } else if (selectedPrice === "Low to High") {
      setSelectedPrice("High to Low");
    } else {
      setSelectedPrice("Sort by Price");
    }
  };

  // ❌ Error handling for React Query
  if (labsError) {
    return (
      <main className="container mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
          <h2 className="text-red-800 text-xl font-semibold mb-2">Error Loading Labs</h2>
          <p className="text-red-600 mb-4">
            {labsErrorDetails?.message || 'Failed to load laboratory data'}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto p-6">
      <section className="mb-6 flex flex-col md:flex-row md:space-x-4 space-y-2 md:space-y-0 items-stretch md:items-center justify-center w-full">

        {/* Filters */}
        <div className="flex flex-row w-full md:w-auto gap-2">
          <div className="w-1/2 md:w-auto">
            <label htmlFor="category-filter" className="sr-only">
              Filter by Category
            </label>
            <select id="category-filter" onChange={(e) => setSelectedCategory(e.target.value)}
              value={selectedCategory} className="pl-4 pr-2 py-2 border rounded bg-white text-gray-800 
              shadow-md hover:bg-[#caddff] cursor-pointer w-full">
              <option value="All">
                All Categories
              </option>
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
            <select id="provider-filter" onChange={(e) => setSelectedProvider(e.target.value)}
              value={selectedProvider} className="px-4 py-2 border rounded bg-white text-gray-800 
              shadow-md hover:bg-[#caddff] cursor-pointer w-full">
              <option value="All">
                All Providers
              </option>
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
              <select onChange={(e) => setSelectedFilter(e.target.value)} value={selectedFilter}
                className="bg-white rounded border border-transparent py-1 px-1.5 flex items-center 
                text-sm transition-all text-slate-600 hover:bg-[#caddff] cursor-pointer">
                <option value="Keyword">Keyword</option>
                <option value="Name">Name</option>
              </select>
              <div className="h-6 border-l border-slate-200 ml-1.5" />
            </div>

            <input ref={searchInputRef} type="text" placeholder="Type here..." onKeyDown={handleKeyDown}
              className="w-full bg-transparent placeholder:text-slate-500 text-[#caddff] text-sm border 
              border-slate-200 rounded-md pl-28 pr-24 py-2 transition duration-300 ease focus:outline-none 
              focus:border-[#caddff] shadow-sm focus:shadow"
              onChange={handleInputChange}/>

            <button onClick={handleSearch} className="absolute top-1 right-1 flex items-center rounded 
              bg-[#715c8c]  py-1 px-2.5 border border-transparent text-center text-sm text-white 
              transition-all shadow-sm hover:shadow focus:bg-slate-700 focus:shadow-none 
              active:bg-slate-700 hover:bg-slate-700 active:shadow-none disabled:pointer-events-none 
              disabled:opacity-50 disabled:shadow-none" type="button">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" 
              className="size-4 mr-1.5">
                <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 
                1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />
              </svg>
              Search
            </button> 
          </div>   
        </div>

        {/* Price sorting */}
        <div className="w-full md:w-auto flex justify-center md:justify-start items-center">
          <button onClick={handlePriceClick} value={selectedPrice}
            className="w-[130px] py-[7px] border border-[#caddff] rounded bg-[#715c8c] 
            text-white shadow-md hover:bg-slate-700 cursor-pointer">
            {selectedPrice}
          </button>
        </div>

        </section>

      {/* Labs Grid */}
      <section>
      {loading ? (
        <LabCardGridSkeleton count={6} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 min-[1024px]:grid-cols-3 gap-6">
          {Array.isArray(searchFilteredLabs) && searchFilteredLabs.map((lab) => {
            // Filter user bookings for this specific lab using BookingContext
            const labUserBookings = isLoggedIn ? 
              (userBookings?.filter(booking => booking.labId === lab.id) || []) : [];
            const hasActiveBooking = isLoggedIn ? 
              isBookingActive(labUserBookings) : false;
            return (
              <LabCard key={lab.id} {...lab} 
                        activeBooking={hasActiveBooking} 
                        image={lab.images?.[0]} />
            );
          })}
        </div>
      )}
      </section>
    </main>
  );
}

// Market component doesn't accept any props
Market.propTypes = {}
