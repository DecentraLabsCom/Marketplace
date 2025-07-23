"use client";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLabs } from '@/context/LabContext';
import { useUser } from '@/context/UserContext';
import LabCard from "@/components/LabCard";
import { LabCardGridSkeleton } from '@/components/skeletons';
import isBookingActive from '@/utils/isBookingActive';

export default function Market() {
  const searchInputRef = useRef(null);
  const { labs, loading } = useLabs();
  const { isLoggedIn } = useUser();
  
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedPrice, setSelectedPrice] = useState("Sort by Price");
  const [selectedProvider, setSelectedProvider] = useState("All");
  const [selectedFilter, setSelectedFilter] = useState("Keyword");
  const [searchFilteredLabs, setSearchFilteredLabs] = useState([]);
  const [searchDebounce, setSearchDebounce] = useState("");

  // Get all lab categories and providersusing memoization
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

  // Apply the search every time the filter options change
  useEffect(() => {
    search();
  }, [search]);

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
            const hasActiveBooking = isLoggedIn ? 
              isBookingActive(lab.userBookings) : false;
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
