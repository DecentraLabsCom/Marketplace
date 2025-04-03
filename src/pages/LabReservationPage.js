import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useLabs } from "../context/LabContext";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import Carrousel from '@/components/Carrousel';

export default function ReservationPage() {
  const { labs } = useLabs();
  const router = useRouter();
  const { id } = router.query;
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState("");
  const [lab, setLab] = useState(null);

  useEffect(() => {
    if (labs && labs.length > 0 && id) {
      const currentLab = labs.find((lab) => lab.id == id);
      setLab(currentLab);
    }
  }, [id, labs]);

  if (!lab) {
    return <div className="text-center text-white">Loading lab details...</div>;
  }

  return (
    <div className="container mx-auto p-6 text-white">
      <h1 className="text-center text-2xl font-bold mb-4">Book your lab now!</h1>
      
      <div className="mb-6">
        <label className="block text-lg font-semibold mb-2">Select the lab:</label>
        <select
          className="w-full p-3 border-2 bg-gray-800 text-white rounded cursor-not-allowed"
          value={lab?.id || ""}
          disabled
        >
          {lab && <option value={lab.id}>{lab.name}</option>}
        </select>
      </div>
      
      <div className="flex flex-col md:flex-row gap-6">
        <div className="md:w-1/2 flex flex-col items-center justify-center p-4 mr-8">
          <div className="w-full h-[400px] flex items-center justify-center">
            {lab.image && lab.image.length > 0 ? (
              <div className="w-full h-full">
                <Carrousel lab={lab} />
              </div>
            ) : (
              <div className="text-center">No images available</div>
            )}
          </div>
        </div>
        
        <div className="md:w-1/2 pr-8">
          <p className="text-gray-400 text-sm text-justify mb-4">{lab.description}</p>
          <p className="text-blue-600 font-semibold text-xl">{lab.price} ETH</p>
          
          {/* Date Picker y Time Selection */}
          <div className="flex flex-col md:flex-row gap-4 mt-6">
            {/* Date Picker */}
            <div className="flex-1">
              <label className="block text-lg font-semibold">Select the date:</label>
              <DatePicker
                selected={date}
                onChange={(newDate) => setDate(newDate)}
                className="w-full p-3 border-2 bg-gray-800 text-white rounded"
                dateFormat="yyyy-MM-dd"
                inline
              />
            </div>
            
            {/* Time Picker */}
            <div className="flex-1">
              <label className="block text-lg font-semibold">Select the time:</label>
              <input
                type="time"
                className="w-full p-3 border-2 bg-gray-800 text-white rounded"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
      
      {/* Submit Button */}
      <button className="w-full bg-blue-500 text-white p-3 rounded mt-6 hover:bg-blue-600">
        Add Booking
      </button>
    </div>
  );
}
