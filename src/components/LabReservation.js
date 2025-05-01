"use client";
import React, { useState, useEffect } from "react";
import DatePicker from "react-datepicker";
import { useRouter } from "next/navigation";
import { useUser } from "../context/UserContext";
import { useLabs } from "../context/LabContext";
import Carrousel from "./Carrousel";
import AccessControl from './AccessControl';
import { format, isToday, addMinutes } from "date-fns";

export default function LabReservation({ id }) {
  const { labs } = useLabs();
  const { isLoggedIn } = useUser();
  const router = useRouter();

  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(15);
  const [availableTimes, setAvailableTimes] = useState([]);
  const [selectedLab, setSelectedLab] = useState(null);
  const [bookedDates, setBookedDates] = useState([]);
  const [isClient, setIsClient] = useState(false);
  const now = new Date();
  const currentDate = now.toISOString().slice(0, 10);
  const renderDayContents = (day, currentDateRender) => {
    const bookingsOnDay = bookedDates.filter(
      (d) => d.toDateString() === currentDateRender.toDateString()
    );
  
    let title = undefined;
  
    if (bookingsOnDay.length > 0 && selectedLab?.bookingInfo) {
      title = bookingsOnDay.map(bookingDate => {
        const matchingBooking = selectedLab.bookingInfo.find(
          b => new Date(b.date).toDateString() === bookingDate.toDateString()
        );
        if (matchingBooking?.time && matchingBooking?.minutes) {
          const endTimeDate = new Date(new Date(matchingBooking.date + 'T' + matchingBooking.time).getTime() + matchingBooking.minutes * 60 * 1000);
          const endTime = `${String(endTimeDate.getHours()).padStart(2, '0')}:${String(endTimeDate.getMinutes()).padStart(2, '0')}`;
          return `${selectedLab.name}: ${matchingBooking.time} - ${endTime}`;
        }
        return 'Booked';
      }).join(', ');
    }
  
    return <div title={title}>{day}</div>;
  };

  useEffect(() => {
    if (!date) setDate(new Date());
  }, []);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (labs.length && id) {
      const currentLab = labs.find((lab) => lab.id == id);
      setSelectedLab(currentLab);
    }
  }, [id, labs]);

  useEffect(() => {
    if (selectedLab && Array.isArray(selectedLab.bookingInfo)) {
      const newTimes = generateTimeOptions(time);
      setAvailableTimes(newTimes);
      const futureBookingDatesForSelectedLab = selectedLab.bookingInfo
        .filter(booking => booking.date >= currentDate)
        .map(booking => {
          try {
            const dateObject = new Date(booking.date);
            if (!isNaN(dateObject)) {
              return dateObject;
            }
          } catch (error) {
            console.error("Error al convertir fecha:", booking.date, error);
          }
          return null;
        })
        .filter(dateObject => dateObject !== null);
  
      setBookedDates(futureBookingDatesForSelectedLab);
    } else {
      setBookedDates([]);
    }
  }, [time, date, selectedLab, currentDate]);

  const generateTimeOptions = (interval) => {
    const options = [];
    const now = new Date();
  
    const dayBookings = selectedLab?.bookingInfo?.filter(
      (b) =>
        b.labId == selectedLab?.id &&
        new Date(b.date).toDateString() === date.toDateString()
    ) || [];
  
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);
  
    let slot = new Date(dayStart);
  
    while (slot <= dayEnd) {
      const slotStart = new Date(slot);
      const duration = interval;
      const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);
      const timeFormatted = format(slotStart, "HH:mm");
  
      if (isToday(date) && slotStart <= now) {
        options.push({ value: timeFormatted, label: timeFormatted, disabled: true, isReserved: false });
        slot.setTime(slotEnd.getTime());
        continue;
      }
  
      const isTimeSlotBlocked = dayBookings.some(booking => {
        const bookingStart = new Date(`${booking.date}T${booking.time}`);
        const bookingEnd = new Date(bookingStart.getTime() + parseInt(booking.minutes) * 60 * 1000);
        return slotStart < bookingEnd && slotEnd > bookingStart;
      });
  
      options.push({
        value: timeFormatted,
        label: timeFormatted,
        disabled: isTimeSlotBlocked,
        isReserved: isTimeSlotBlocked,
      });
  
      slot.setTime(slotEnd.getTime());
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

  if (!isClient) return null;

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
              <p className="text-white text-sm text-justify mb-4">{selectedLab.description}</p>
              <p className="text-[#335763] font-semibold text-xl">{selectedLab.price} $LAB / hour</p>

              <div className="flex flex-col md:flex-row gap-4 mt-6 items-center">
                <div className="flex-1">
                  <label className="block text-lg font-semibold">Select the date:</label>
                  <DatePicker calendarClassName="custom-datepicker"
                    selected={date}
                    onChange={(newDate) => setDate(newDate)}
                    minDate={parseDate(selectedLab.opens)}
                    maxDate={parseDate(selectedLab.closes)}
                    inline
                    dayClassName={(day) =>
                      bookedDates.some(
                        (d) => d.toDateString() === day.toDateString()
                      )
                        ? "bg-[#9fc6f5] text-white"
                        : undefined
                    }
                    renderDayContents={renderDayContents}
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
                    className={`w-full p-3 border-2 ${availableTimes.some(t => !t.disabled) ? 'bg-gray-800 text-white' : 'bg-gray-600 text-gray-400'} rounded`}
                    disabled={!availableTimes.some(t => !t.disabled)}
                  >
                    {availableTimes.map((timeOption, i) => (
                      <option
                        key={i}
                        value={timeOption.value}
                        disabled={timeOption.disabled}
                        style={{ color: timeOption.isReserved ? 'gray' : 'white' }}
                      >
                        {timeOption.label}
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
