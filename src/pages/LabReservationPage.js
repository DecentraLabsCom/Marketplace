import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useLabs } from "../context/LabContext";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import Carrousel from '../components/Carrousel';

export default function ReservationPage() {
  const { labs } = useLabs();
  const router = useRouter();
  const { id } = router.query;
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState("");
  const [selectedLab, setSelectedLab] = useState(null);

  useEffect(() => {
    if (labs && labs.length > 0) {
      if (id) {
        const currentLab = labs.find((lab) => lab.id == id);
        setSelectedLab(currentLab);
      }
    }
  }, [id, labs]);

  const handleLabChange = (event) => {
    const labId = event.target.value;
    const lab = labs.find((l) => l.id == labId);
    setSelectedLab(lab);
  };

  return (
    <div className="container mx-auto p-6 text-white">
      <h1 className="text-center text-2xl font-bold mb-4">Book your lab now!</h1>
      
      <div className="mb-6">
        <label className="block text-lg font-semibold mb-2">Select the lab:</label>
        <select
          className="w-full p-3 border-2 bg-gray-800 text-white rounded"
          value={selectedLab?.id || ""}
          onChange={handleLabChange}
          disabled={!!id}
        >
          <option value="" disabled>Select a lab</option>
          {labs.map((lab) => (
            <option key={lab.id} value={lab.id}>{lab.name}</option>
          ))}
        </select>
      </div>
      
      {selectedLab && (
        <div className="flex flex-col md:flex-row gap-6 p-4">
          <div className="md:w-1/2 flex flex-col items-center justify-center">
            <div className="w-full h-[400px] flex items-center justify-center">
              <Carrousel lab={selectedLab} />
            </div>
          </div>
          
          <div className="md:w-1/2 mt-2">
            <p className="text-gray-400 text-sm text-justify mb-4">{selectedLab.description}</p>
            <p className="text-blue-600 font-semibold text-xl">{selectedLab.price} ETH</p>
            
            <div className="flex flex-col md:flex-row gap-4 mt-6 items-center">
              <div className="flex-1 w-full md:w-auto">
                <label className="block text-lg font-semibold">Select the date:</label>
                <DatePicker
                  selected={date}
                  onChange={(newDate) => setDate(newDate)}
                  calendarClassName="custom-datepicker"
                  dateFormat="yyyy-MM-dd"
                  inline
                />
              </div>
              
              <div className="flex-1 w-full md:w-auto">
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
      )}
      
      <div className="flex justify-center">
        <button className="w-1/3 bg-[#715c8c] text-white p-3 rounded mt-6 hover:bg-[#333f63]">
          Make Booking
        </button>
      </div>
    </div>
  );
}