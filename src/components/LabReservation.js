"use client";
import React, { useState, useEffect, useCallback } from "react";
import DatePicker from "react-datepicker";
import { useLabs } from "../context/LabContext";
import Carrousel from "./Carrousel";
import AccessControl from './AccessControl';
import { generateTimeOptions, renderDayContents } from '../utils/labBookingCalendar';

export default function LabReservation({ id }) {
  const { labs } = useLabs();

  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(15);
  const [selectedAvailableTime, setSelectedAvailableTime] = useState('');
  const [selectedLab, setSelectedLab] = useState(null);
  const [isClient, setIsClient] = useState(false);

  const parseDate = (str) => {
    if (!str) return new Date();
    const [month, day, year] = str.split("/");
    return new Date(`${year}-${month}-${day}`);
  };

  // Select the lab by id
  useEffect(() => {
    if (labs.length && id) {
      const currentLab = labs.find((lab) => lab.id == id);
      setSelectedLab(currentLab);
    }
  }, [id, labs]);

  // Update the time interval when the selected lab changes
  useEffect(() => {
    if (selectedLab && Array.isArray(selectedLab.timeSlots) && selectedLab.timeSlots.length > 0) {
      setTime(selectedLab.timeSlots[0]);
    }
  }, [selectedLab]);

  // Select the first available time when the available times change
  useEffect(() => {
    if (!selectedLab) return;
    const availableTimes = generateTimeOptions({
      date,
      interval: time,
      bookingInfo: selectedLab.bookingInfo
    });
    const firstAvailable = availableTimes.find(t => !t.disabled);
    setSelectedAvailableTime(firstAvailable ? firstAvailable.value : '');
  }, [date, time, selectedLab]);

  // To avoid hydration warning in SSR
  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient) return null;

  // Min and max dates for the calendar
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const opensDate = selectedLab ? parseDate(selectedLab.opens) : today;
  const minDate = opensDate > today ? opensDate : today;
  const maxDate = selectedLab ? parseDate(selectedLab.closes) : undefined;

  // Available times for the selected day and lab
  const availableTimes = selectedLab
    ? generateTimeOptions({
        date,
        interval: time,
        bookingInfo: selectedLab.bookingInfo
      })
    : [];

  // Render days with reservation tooltips
  const dayContents = (day, currentDateRender) =>
    renderDayContents({
      day,
      currentDateRender,
      bookingInfo: (selectedLab?.bookingInfo || []).map(booking => ({
        ...booking,
        labName: selectedLab?.name
      }))
    });

  // Change lab
  const handleLabChange = (e) => {
    const selectedId = e.target.value;
    const lab = labs.find((lab) => lab.id == selectedId);
    setSelectedLab(lab);
  };

  const handleBooking = async () => {
    const labId = Number(selectedLab?.id);

    // --- 1. Calculate `start` (Unix timestamp in seconds) ---
    // Combine date and start time (selectedAvailableTime)
    const [hours, minutes] = selectedAvailableTime.split(':').map(Number);
    const startDate = new Date(date);
    startDate.setHours(hours);
    startDate.setMinutes(minutes);
    startDate.setSeconds(0);
    startDate.setMilliseconds(0);

    // Convert to Unix timestamp in seconds
    const reservationStart = Math.floor(startDate.getTime() / 1000);

    // --- 2. Calculate `timeslot` (duration in seconds) ---
    const timeslotInSeconds = time * 60;

    try {
    const response = await fetch('/api/contract/reservation/makeBooking', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        labId: labId,
        start: reservationStart,
        timeslot: timeslotInSeconds,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      console.log('Booking successful:', data);
      // - Display a success message to the user
      // - Update UI state to reflect the reservation
    } else {
      console.error('Booking failed:', data.error || 'Unknown error');
      // Display an error message to the user
    }
  } catch (error) {
    console.error('Error making booking request:', error);
    // Handle network errors or unexpected fetch errors
    // Display a generic error message to the user
  }
  }

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
                  <DatePicker
                    calendarClassName="custom-datepicker"
                    selected={date}
                    onChange={(newDate) => setDate(newDate)}
                    minDate={minDate}
                    maxDate={maxDate}
                    inline
                    renderDayContents={dayContents}
                    dayClassName={day =>
                      selectedLab?.bookingInfo?.some(
                        b => {
                          // Make sure b.date is valid
                          const bookingDate = new Date(b.date);
                          return !isNaN(bookingDate) && bookingDate.toDateString() === day.toDateString();
                        }
                      )
                        ? "bg-[#9fc6f5] text-white"
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
                    className={`w-full p-3 border-2 ${availableTimes.some(t => !t.disabled) ? 'bg-gray-800 text-white' : 'bg-gray-600 text-gray-400'} rounded`}
                    value={selectedAvailableTime}
                    onChange={e => setSelectedAvailableTime(e.target.value)}
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
            <button
              onClick={handleBooking} 
              className="w-1/3 bg-[#715c8c] text-white p-3 rounded mt-6 hover:bg-[#333f63]"
            >
              Make Booking
            </button>
          </div>
        )}
      </div>
    </AccessControl>
  );
}