import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useLabs } from "../context/LabContext";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import Carrousel from "../components/Carrousel";
import { addMinutes, format } from "date-fns"; 

export default function ReservationPage() {
  const { labs } = useLabs();
  const router = useRouter();
  const { id } = router.query;
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(15); // Por defecto 15 minutos
  const [availableTimes, setAvailableTimes] = useState([]);
  const [selectedLab, setSelectedLab] = useState(null);

  useEffect(() => {
    if (labs && labs.length > 0) {
      if (id) {
        const currentLab = labs.find((lab) => lab.id == id);
        setSelectedLab(currentLab);
      }
    }
  }, [id, labs]);

  useEffect(() => {
    if (selectedLab) {
      setAvailableTimes(generateTimeOptions(time));
    }
  }, [time, selectedLab]);

  const generateTimeOptions = (interval) => {
    const options = [];
    const now = new Date();
  
    const selectedDateStart = new Date(date);
    selectedDateStart.setHours(0, 0, 0, 0);
  
    const selectedDateEnd = new Date(date);
    selectedDateEnd.setHours(23, 59, 59, 999);
  
    for (let hour = 0; hour < 24; hour++) {
      const minutesArray = interval === 60 ? [0] : interval === 30 ? [0, 30] : [0, 15, 30, 45];
  
      minutesArray.forEach((min) => {
        const optionTime = new Date(date);
        optionTime.setHours(hour, min, 0, 0);
  
        if (isToday(date) && optionTime <= now) return;
  
        if (optionTime >= selectedDateStart && optionTime <= selectedDateEnd) {
          options.push(format(optionTime, "HH:mm"));
        }
      });
    }
  
    return options;
  };
  
  const isToday = (someDate) => {
    const today = new Date();
    return (
      someDate.getDate() === today.getDate() &&
      someDate.getMonth() === today.getMonth() &&
      someDate.getFullYear() === today.getFullYear()
    );
  };
  
  const handleLabChange = (event) => {
    const labId = event.target.value;
    const lab = labs.find((l) => l.id == labId);
    setSelectedLab(lab);
  };

  const parseDate = (dateStr) => {
    const [month, day, year] = dateStr.split("/");
    return new Date(`${year}`, month - 1, day);
  };

  return (
    <div className="container mx-auto p-4 text-white">
      <div className="relative bg-cover bg-center text-white py-5 text-center">
        <h1 className="text-3xl font-bold mb-2">Book your Lab now!</h1>
      </div>

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
            <p className="text-blue-600 font-semibold text-xl">{selectedLab.price} $LAB / hour</p>

            <div className="flex flex-col md:flex-row gap-4 mt-6 items-center">
              <div className="flex-1 w-full md:w-auto">
                <label className="block text-lg font-semibold">Select the date:</label>
                <DatePicker
                  selected={date}
                  onChange={(newDate) => setDate(newDate)}
                  minDate={parseDate(selectedLab.day_start)} // Min date  
                  maxDate={parseDate(selectedLab.day_finish)} // Max date
                  calendarClassName="custom-datepicker"
                  dateFormat="yyyy-MM-dd"
                  inline
                />
              </div>

              <div className="flex-1 w-full md:w-auto">
                <label className="block text-lg font-semibold">Select the time interval:</label>
                <select
                  className="w-full p-3 border-2 bg-gray-800 text-white rounded"
                  value={time}
                  onChange={(e) => setTime(Number(e.target.value))}
                >
                  {selectedLab.time.map((interval) => (
                    <option key={interval} value={interval}>
                      {interval} minutes
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex-1 w-full md:w-auto">
                <label className="block text-lg font-semibold">Select the time:</label>
                <select
                  className="w-full p-3 border-2 bg-gray-800 text-white rounded"
                  disabled={!availableTimes.length}
                >
                  {availableTimes.map((timeOption, index) => (
                    <option key={index} value={timeOption}>
                      {timeOption}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedLab && (
        <div className="flex justify-center">
          <button className="w-1/3 bg-[#715c8c] text-white p-3 rounded mt-6 hover:bg-[#333f63]">
            Make Booking
          </button>
        </div>
      )}
    </div>
  );
}
