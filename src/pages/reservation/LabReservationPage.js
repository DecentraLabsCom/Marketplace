import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useUser } from "../../context/UserContext";
import { useLabs } from "../../context/LabContext";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import Carrousel from "../../components/Carrousel";
import AccessControl from '../../components/AccessControl';
import { format, isToday, addMinutes } from "date-fns";

export default function ReservationPage() {
  const { labs } = useLabs();
  const { isLoggedIn } = useUser();
  const router = useRouter();
  const { id } = router.query;

  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(15);
  const [availableTimes, setAvailableTimes] = useState([]);
  const [selectedLab, setSelectedLab] = useState(null);
  const [bookedDates, setBookedDates] = useState([]);

  useEffect(() => {
    if (labs.length && id) {
      const currentLab = labs.find((lab) => lab.id == id);
      setSelectedLab(currentLab);
    }
  }, [id, labs]);

  useEffect(() => {
    if (selectedLab && selectedLab.bookingInfo) {
      const newTimes = generateTimeOptions(time);
      setAvailableTimes(newTimes);

      const labBookings = selectedLab.bookingInfo.filter(
        (b) => b.labId == selectedLab.id && b.activeBooking
      );
      const uniqueDates = [
        ...new Set(labBookings.map((b) => new Date(b.date).toDateString())),
      ];
      setBookedDates(uniqueDates.map((d) => new Date(d)));
    }
  }, [time, date, selectedLab]);

  const isTimeSlotTaken = (slotStart, duration, dayBookings) => {
    const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);
    for (const booking of dayBookings) {
      const bookingStart = new Date(`${booking.date}T${booking.time}`);
      const bookingEnd = new Date(bookingStart.getTime() + parseInt(booking.minutes) * 60 * 1000);
      if (slotStart < bookingEnd && slotEnd > bookingStart) {
        return true;
      }
    }
    return false;
  };

  const generateTimeOptions = (interval) => {
    const options = [];
    const now = new Date();
  
    const dayBookings = selectedLab.bookingInfo.filter(
      (b) =>
        b.labId == selectedLab?.id && b.activeBooking &&
        new Date(b.date).toDateString() === date.toDateString()
    );
  
    const blockedRanges = dayBookings.map((b) => {
      const start = new Date(`${b.date}T${b.time}`);
      const end = addMinutes(start, parseInt(b.minutes));
      return { start, end };
    });
  
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    let slot = new Date(dayStart);

    while (slot <= dayEnd) {
      const endSlot = addMinutes(slot, interval);

      if (isToday(date) && slot <= now) {
        slot = addMinutes(slot, interval);
        continue;
      }

      const isConflict = blockedRanges.some(
        ({ start, end }) =>
          (slot >= start && slot < end) ||
          (endSlot > start && endSlot <= end) ||
          (slot <= start && endSlot >= end)
      );

      if (!isConflict) {
        options.push(format(slot, "HH:mm"));
      }

      slot = addMinutes(slot, interval);
    }
  
    return options;
  };

  const handleLabChange = (e) => {
    const selectedId = e.target.value;
    const lab = labs.find((lab) => lab.id == selectedId);
    setSelectedLab(lab);
  };

  const parseDate = (str) => {
    const [month, day, year] = str.split("/");
    return new Date(`${year}-${month}-${day}`);
  };

  return (
    <AccessControl message="Please log in to view and make reservations.">
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
                <div className="flex-1">
                  <label className="block text-lg font-semibold">Select the date:</label>
                  <DatePicker
                    selected={date}
                    onChange={(newDate) => setDate(newDate)}
                    minDate={parseDate(selectedLab.opens)}
                    maxDate={parseDate(selectedLab.closes)}
                    inline
                    dayClassName={(day) =>
                      bookedDates.some(
                        (d) => d.toDateString() === day.toDateString()
                      )
                        ? "bg-red-500 text-white rounded-full"
                        : undefined
                    }
                  />
                </div>

                <div className="flex-1">
                  <label className="block text-lg font-semibold">Time interval:</label>
                  <select
                    className="w-full p-3 border-2 bg-gray-800 text-white rounded"
                    value={time}
                    onChange={(e) => setTime(Number(e.target.value))}
                  >
                    {selectedLab.timeSlots.map((slot) => (
                      <option key={slot} value={slot}>{slot} minutes</option>
                    ))}
                  </select>
                </div>

                <div className="flex-1">
                  <label className="block text-lg font-semibold">Available times:</label>
                  <select
                    className="w-full p-3 border-2 bg-gray-800 text-white rounded"
                    disabled={!availableTimes.length}
                  >
                    {availableTimes.map((time, i) => (
                      <option key={i} value={time}>
                        {time}
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
    </AccessControl>
  );
}
