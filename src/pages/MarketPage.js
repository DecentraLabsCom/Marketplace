import { useState, useEffect } from "react";
import { useLabs } from '../context/LabContext';
import LabCard from "@/components/LabCard";

export default function MarketPage() {
  const { labs, loading } = useLabs();
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Filter labs by selected category
  const filteredLabs = selectedCategory === "All"
    ? labs
    : labs.filter((lab) => lab.category === selectedCategory);

  return (
    <div className="container mx-auto p-6">
      {/* Filter Dropdown */}
      <div className="mb-6 flex justify-center">
        <select
          onChange={(e) => setSelectedCategory(e.target.value)}
          value={selectedCategory}
          className="px-4 py-2 border rounded bg-white text-gray-800 shadow-md"
        >
          <option value="All">All Categories</option>
          <option value="Industrial">Industrial</option>
          <option value="Robotics">Robotics</option>
          <option value="Instrumentation">Instrumentation</option>
          <option value="Optics">Optics</option>
        </select>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="text-center">Loading labs...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {filteredLabs.map((lab) => (
            <LabCard key={lab.id} {...lab} image={lab.image[0]}/>
          ))}
        </div>
      )}
    </div>
  );
}