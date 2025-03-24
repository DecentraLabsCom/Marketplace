import { useState, useEffect } from "react";
import LabCard from "@/components/LabCard";
import { appendPath } from '../utils/pathUtils';

export default function MarketPage() {
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("All");

  useEffect(() => {
    // Simulate fetching lab data (replace with actual API call)
    setTimeout(() => {
      setLabs([
        { id: 1, name: "Four Tanks Lab", category: "Industrial", price: 2.5, 
          description: "", provider: "UNED", auth: "https://sarlab.dia.uned.es/auth/", 
          image: appendPath + "/labs/lab_1.jpg" },
        { id: 2, name: "Mobile Robots Lab", category: "Robotics", price: 0.8, 
          description: "", provider: "UHU", auth: "https://sarlab.dia.uned.es/auth/", 
          image: appendPath + "/labs/lab_2.jpg" },
        { id: 3, name: "Industrial Instrumentation Lab", category: "Instrumentation", price: 1.0, 
          description: "", provider: "UNED",auth: "https://sarlab.dia.uned.es/auth/", 
          image: appendPath + "/labs/lab_3.jpg" },
        { id: 4, name: "Three Tanks Lab", category: "Industrial", price: 1.5, 
          description: "", provider: "UHU", auth: "https://sarlab.dia.uned.es/auth/", 
          image: appendPath + "/labs/lab_4.jpg" },
        { id: 5, name: "Snell's Law Lab", category: "Optics", provider: "UBC", price: 1.3,
          description: "",  provider: "UBC", auth: "https://sarlab.dia.uned.es/auth/", 
          image: appendPath + "/labs/lab_5.jpg" },
      ]);
      setLoading(false);
    }, 1500); // Simulate a 1.5-second delay for fetching data
  }, []);

  // Filter labs by selected category
  const filteredLabs = selectedCategory === "All"
    ? labs
    : labs.filter(lab => lab.category === selectedCategory);

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
            <LabCard key={lab.id} {...lab} />
          ))}
        </div>
      )}
    </div>
  );
}