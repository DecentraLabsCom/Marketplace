"use client";
import React, { useState, useEffect } from "react";
import DatePicker from "react-datepicker";
import { useAccount, useWaitForTransactionReceipt } from 'wagmi';
import { useLabs } from "@/context/LabContext";
import { useUser } from "@/context/UserContext";
import { useReservationEvents } from "@/context/ReservationEventContext";
import { useNotifications } from "@/context/NotificationContext";
import Carrousel from "@/components/Carrousel";
import AccessControl from '@/components/AccessControl';
import { generateTimeOptions, renderDayContents } from '@/utils/labBookingCalendar';
import useContractWriteFunction from "@/hooks/contract/useContractWriteFunction";
import { contractAddresses } from "@/contracts/diamond";

export default function LabReservation({ id }) {
  const { labs, fetchBookings } = useLabs();
  const { isSSO } = useUser();
  const { processingReservations } = useReservationEvents();
  const { addTemporaryNotification, addPersistentNotification, addErrorNotification } = useNotifications();
  const { chain, isConnected } = useAccount();
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(15);
  const [selectedAvailableTime, setSelectedAvailableTime] = useState('');
  const [selectedLab, setSelectedLab] = useState(null);
  const [isClient, setIsClient] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  
  // Transaction state management (modernized pattern)
  const [lastTxHash, setLastTxHash] = useState(null);
  const [txType, setTxType] = useState(null); // 'reservation'
  const [pendingData, setPendingData] = useState(null);
  
  const { contractWriteFunction: reservationRequest } = useContractWriteFunction('reservationRequest');
  
  // Wait for transaction receipt
  const { 
    data: receipt, 
    isLoading: isWaitingForReceipt, 
    isSuccess: isReceiptSuccess 
  } = useWaitForTransactionReceipt({
    hash: lastTxHash,
    enabled: !!lastTxHash
  });

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
      bookingInfo: (selectedLab.bookingInfo || []).filter(booking => 
        booking.status !== "4" && booking.status !== 4 // Exclude cancelled bookings
      )
    });
    const firstAvailable = availableTimes.find(t => !t.disabled);
    setSelectedAvailableTime(firstAvailable ? firstAvailable.value : '');
  }, [date, time, selectedLab]);

  // To avoid hydration warning in SSR
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Handle transaction confirmation
  useEffect(() => {
    if (isReceiptSuccess && receipt && txType && pendingData) {
      
      addPersistentNotification('success', '✅ Reservation request confirmed onchain! Processing your booking...');
      
      setIsBooking(false);
      
      // Reset transaction state
      setLastTxHash(null);
      setTxType(null);
      setPendingData(null);

      // The ReservationEventContext will handle updating bookings when confirmed/denied
    }
  }, [isReceiptSuccess, receipt, txType, pendingData, addPersistentNotification]);

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
        bookingInfo: (selectedLab.bookingInfo || []).filter(booking => 
          booking.status !== "4" && booking.status !== 4 // Exclude cancelled bookings
        )
      })
    : [];

  // Render days with reservation tooltips
  const dayContents = (day, currentDateRender) =>
    renderDayContents({
      day,
      currentDateRender,
      bookingInfo: (selectedLab?.bookingInfo || [])
        .filter(booking => booking.status !== "4" && booking.status !== 4) // Exclude cancelled bookings
        .map(booking => ({
          ...booking,
          labName: selectedLab?.name,
          status: booking.status // Ensure status is included for styling
        }))
    });

  // Change lab
  const handleLabChange = (e) => {
    const selectedId = e.target.value;
    const lab = labs.find((lab) => lab.id == selectedId);
    setSelectedLab(lab);
  };

  // Common notification and state management
  const handleBookingSuccess = () => {
    fetchBookings(); // Update local state
    setIsBooking(false);
  };

  // Common validation and calculation logic
  const validateAndCalculateBooking = () => {
    // Common validations
    if (!selectedAvailableTime) {
      addTemporaryNotification('error', '⚠️ Please select an available time.');
      return null;
    }

    if (!selectedLab?.id) {
      addTemporaryNotification('error', '⚠️ Please select a lab.');
      return null;
    }

    const labId = Number(selectedLab?.id);

    // Calculate start time (Unix timestamp in seconds)
    const [hours, minutes] = selectedAvailableTime.split(':').map(Number);
    const startDate = new Date(date);
    startDate.setHours(hours);
    startDate.setMinutes(minutes);
    startDate.setSeconds(0);
    startDate.setMilliseconds(0);
    const start = Math.floor(startDate.getTime() / 1000);

    // Calculate timeslot (duration in seconds)
    const timeslot = time * 60;

    return { labId, start, timeslot };
  };

  const handleBooking = async () => {
    if (isBooking) return; // Prevent double clicks
    
    // Route to appropriate booking method based on authentication type
    if (isSSO) {
      return await handleServerSideBooking();
    } else {
      return await handleWalletBooking();
    }
  };

  // Server-side booking for SSO users
  const handleServerSideBooking = async () => {
    const bookingData = validateAndCalculateBooking();
    if (!bookingData) return;

    const { labId, start, timeslot } = bookingData;

    setIsBooking(true);
    
    // Show pending notification
    addTemporaryNotification('pending', '⏳ Processing your reservation...');

    try {
      const response = await fetch('/api/contract/reservation/makeBooking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ labId, start, timeslot })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Server booking failed');
      }

      const result = await response.json();

      // Show success notification
      addTemporaryNotification('success', '✅ Reservation request sent! Waiting for confirmation...');
      handleBookingSuccess();

    } catch (error) {
      console.error('Error making server-side booking:', error);
      addErrorNotification(error, 'Failed to create reservation');
    } finally {
      setIsBooking(false);
    }
  };

  // Wallet-based booking for wallet users
  const handleWalletBooking = async () => {
    // Wallet-specific validations
    if (!isConnected) {
      addTemporaryNotification('error', '🔗 Please connect your wallet first.');
      return;
    }

    const contractAddress = contractAddresses[chain?.name?.toLowerCase()];
    if (!contractAddress || contractAddress === "0x...") {
      addTemporaryNotification('error', `❌ Contract not deployed on ${chain?.name || 'this network'}. Please switch to a supported network.`);
      return;
    }

    const bookingData = validateAndCalculateBooking();
    if (!bookingData) return;

    const { labId, start, timeslot } = bookingData;
    const end = start + timeslot; // Wallet booking needs end time

    setIsBooking(true);

    try {
      // Show pending notification
      addTemporaryNotification('pending', '⏳ Transaction sent! Waiting for confirmation...');
      
      // Call contract - pass arguments as array
      const txHash = await reservationRequest([labId, start, end]);
      
      if (txHash) {
        setLastTxHash(txHash);
        setTxType('reservation');
        setPendingData({ labId, start, end, timeslot });
      } else {
        addTemporaryNotification('warning', '⚠️ Transaction may have been sent but no hash received. Please check your wallet.');
        setIsBooking(false);
      }
    } catch (error) {
      console.error('Error making booking request:', error);
      
      if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
        addTemporaryNotification('warning', '🚫 Transaction rejected by user.');
      } else {
        addErrorNotification(error, 'Reservation creation');
      }
      
      setIsBooking(false); // Set to false on error
    }
  };

  return (
    <AccessControl message="Please log in to view and make reservations.">
      <div className="container mx-auto p-4 text-white">
        <div className="relative bg-cover bg-center text-white py-5 text-center">
          <h1 className="text-3xl font-bold mb-2">Book your Lab now!</h1>
          {processingReservations.size > 0 && (
            <div className="mt-2 text-yellow-300">
              ⏳ Processing {processingReservations.size} reservation{processingReservations.size > 1 ? 's' : ''}...
            </div>
          )}
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
                          // Exclude cancelled bookings from calendar highlighting
                          if (b.status === "4" || b.status === 4) return false;
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
                    className={`w-full p-3 border-2 ${availableTimes.some(t => !t.disabled) ? 
                      'bg-gray-800 text-white' : 'bg-gray-600 text-gray-400'} rounded`}
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
              disabled={isBooking || (isWaitingForReceipt && !isSSO) || !selectedAvailableTime}
              className={`w-1/3 text-white p-3 rounded mt-6 transition-colors ${
                isBooking || (isWaitingForReceipt && !isSSO) || !selectedAvailableTime
                  ? 'bg-gray-500 cursor-not-allowed' 
                  : 'bg-[#715c8c] hover:bg-[#333f63]'
              }`}
            >
              {isBooking ? (isSSO ? 'Processing...' : 'Sending...') : 
               (isWaitingForReceipt && !isSSO) ? 'Confirming...' : 
               'Make Booking'}
            </button>
          </div>
        )}
      </div>
    </AccessControl>
  );
}