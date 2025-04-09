import { useState, useEffect, useRef } from "react";
import { useLabs } from '../context/LabContext';
import LabCard from "../components/LabCard";

export default function MarketPage() {
  const searchInputRef = useRef(null);
  const { labs, loading } = useLabs();
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedPrice, setSelectedPrice] = useState("Sort by Price");
  const [selectedProvider, setSelectedProvider] = useState("All");
  const [selectedFilter, setSelectedFilter] = useState("Keyword");
  const [searchFilteredLabs, setSearchFilteredLabs] = useState([]);
  const [categories, setCategories] = useState([]);
  const [providers, setProviders] = useState([]);

  // Get all lab categories and providers
  useEffect(() => {
    if (labs) {
      // Extract each category only once
      const uniqueCategories = [...new Set(labs.map((lab) => lab.category))];
      setCategories(uniqueCategories);
      // Extract each provider only once
      const uniqueProviders = [...new Set(labs.map((lab) => lab.provider))];
      setProviders(uniqueProviders);
    }
  }, [labs]);

  // Apply the search every time the filter options change
  useEffect(() => {
    search();
  }, [selectedCategory, selectedPrice, selectedProvider, labs]);

  // Search by filter options
  const search = () => {
    let filtered = labs;

    // Filter by category
    if (selectedCategory !== "All") {
      filtered = filtered.filter((lab) => lab.category === selectedCategory);
    }

    // Filter by price
    if (selectedPrice === "Low to High") {
      filtered = [...filtered].sort((a, b) => a.price - b.price);
    } else if (selectedPrice === "High to Low") {
      filtered = [...filtered].sort((a, b) => b.price - a.price);
    }

    // Filter by provider
    if (selectedProvider !== "All") {
      filtered = filtered.filter((lab) => lab.provider === selectedProvider);
    }

    // Filter by keyword or name
    const value = searchInputRef.current?.value?.toLowerCase() || "";
    if (selectedFilter === "Keyword" && value) {
      filtered = filtered.filter((lab) =>
        lab.keywords?.some((keyword) => keyword.toLowerCase().includes(value))
      );
    } else if (selectedFilter === "Name" && value) {
      filtered = filtered.filter((lab) =>
        lab.name.toLowerCase().includes(value)
      );
    }

    // Update state with the filtered result
    setSearchFilteredLabs(filtered);
  };

  // Be able to search by pressing Enter key
  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      search();
    }
  };

  // Remove keyword and name filter when deleting input value
  const handleInputChange = (event) => {
    if (!event.target.value) {
      search();
    }
  };

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
      <section className="flex flex-row justify-center items-center">

        {/* Category Filter */}
        <div className="mb-6 flex justify-center px-1">
          <label htmlFor="category-filter" className="sr-only">
            Filter by Category
          </label>
          <select id="category-filter" onChange={(e) => setSelectedCategory(e.target.value)}
            value={selectedCategory} className="pl-4 pr-2 py-2 border rounded bg-white text-gray-800 
            shadow-md hover:bg-[#caddff] cursor-pointer">
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

        {/* Provider Filter */}
        <div className="mb-6 flex justify-center px-1">
          <label htmlFor="provider-filter" className="sr-only">
            Filter by Provider
          </label>
          <select id="provider-filter" onChange={(e) => setSelectedProvider(e.target.value)}
            value={selectedProvider} className="px-4 py-2 border rounded bg-white text-gray-800 
            shadow-md hover:bg-[#caddff] cursor-pointer">
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

        {/* Search Bar */}
        <div className="mb-6 w-full max-w-sm min-w-[20px] mx-1">
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
              className="w-full bg-transparent placeholder:text-slate-500 text-slate-300 text-sm border 
              border-slate-200 rounded-md pl-28 pr-24 py-2 transition duration-300 ease focus:outline-none 
              focus:border-slate-400 hover:border-slate-300 shadow-sm focus:shadow"
              onChange={handleInputChange}/>
        
            <button onClick={search} className="absolute top-1 right-1 flex items-center rounded 
              bg-[#715c8c]  py-1 px-2.5 border border-transparent text-center text-sm text-white 
              transition-all shadow-sm hover:shadow focus:bg-slate-700 focus:shadow-none 
              active:bg-slate-700 hover:bg-slate-700 active:shadow-none disabled:pointer-events-none 
              disabled:opacity-50 disabled:shadow-none" type="button">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" 
              className="w-4 h-4 mr-1.5">
                <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 
                1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd" />
              </svg>
              Search
            </button> 
          </div>   
        </div>

        {/* Price sorting */}
        <div className="mb-6 flex justify-center px-1">
          <button
            onClick={handlePriceClick}
            value={selectedPrice}
            className="w-[130px] py-[7px] outline outline-[1px] rounded bg-[#715c8c] text-white
            shadow-md hover:bg-slate-700 cursor-pointer">
            {selectedPrice}
          </button>
        </div>
      
      </section>

      {/* Labs Grid */}
      <section>
        {loading ? (
          <div className="text-center">Loading labs...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {searchFilteredLabs.map((lab) => (
              <LabCard key={lab.id} {...lab} image={lab.image[0]}/>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}