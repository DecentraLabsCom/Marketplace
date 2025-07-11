"use client";
import React, { useState, useEffect } from "react";
import DatePicker from "react-datepicker";
import { useLabs } from "@/context/LabContext";
import Carrousel from "@/components/Carrousel";
import AccessControl from '@/components/AccessControl';
import { generateTimeOptions, renderDayContents } from '@/utils/labBookingCalendar';
import useContractWriteFunction from "@/hooks/contract/useContractWriteFunction";
import { useAccount, useWaitForTransactionReceipt } from 'wagmi';
import { contractAddresses } from "@/contracts/diamond";

export default function LabReservation({ id }) {
  const { labs, fetchBookings } = useLabs();
  const { chain, isConnected } = useAccount();
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(15);
  const [selectedAvailableTime, setSelectedAvailableTime] = useState('');
  const [selectedLab, setSelectedLab] = useState(null);
  const [isClient, setIsClient] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [lastTxHash, setLastTxHash] = useState(null);
  const [pendingAlert, setPendingAlert] = useState(null);
  const [notification, setNotification] = useState(null);
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
      bookingInfo: selectedLab.bookingInfo
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
    if (isReceiptSuccess && receipt) {
      console.log('Transaction confirmed via useWaitForTransactionReceipt:', receipt.transactionHash);
      
      // Close any pending alert and show success message
      if (pendingAlert) {
        clearTimeout(pendingAlert);
        setPendingAlert(null);
      }
      
      setIsBooking(false);
      setLastTxHash(null);
      
      // Show success notification
      setNotification({
        type: 'success',
        message: '✅ Reservation successfully confirmed onchain!',
        hash: receipt.transactionHash
      });
      
      // Update local state by refetching bookings from the contract
      fetchBookings();
      
      // Auto-hide notification after 5 seconds
      setTimeout(() => setNotification(null), 5000);
    }
  }, [isReceiptSuccess, receipt, fetchBookings, pendingAlert]);

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
    if (isBooking) return; // Prevent double clicks
    
    // Validations
    if (!isConnected) {
      alert('Please connect your wallet first.');
      return;
    }
    
    if (!selectedAvailableTime) {
      alert('Please select an available time.');
      return;
    }

    if (!selectedLab?.id) {
      alert('Please select a lab.');
      return;
    }

    const contractAddress = contractAddresses[chain?.name?.toLowerCase()];
    if (!contractAddress || contractAddress === "0x...") {
      alert(`Contract not deployed on ${chain?.name || 'this network'}. Please switch to a supported network.`);
      return;
    }

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
    const start = Math.floor(startDate.getTime() / 1000);

    // --- 2. Calculate `timeslot` (duration in seconds) and endtime ---
    const timeslot = time * 60;
    const end = start + timeslot;

    setIsBooking(true);

    try {
      console.log(`Attempting to call reservationRequest for labId: ${labId}, start: ${start}, end: ${end}`);
      console.log('Arguments:', [labId, start, end]);
      
      // Call contract - pass arguments as array
      const txHash = await reservationRequest([labId, start, end]);
      console.log('Transaction result:', txHash);
      
      if (txHash) {
        console.log('Transaction sent with hash:', txHash);
        setLastTxHash(txHash);
        
        // Show pending notification
        setNotification({
          type: 'pending',
          message: '⏳ Transaction sent! Waiting for confirmation...',
          hash: txHash
        });
        
        // Show a timeout-based alert that will be replaced by confirmation
        const alertTimeout = setTimeout(() => {
          setNotification({
            type: 'warning',
            message: '⚠️ Transaction is taking longer than usual. Please check your wallet.',
            hash: txHash
          });
        }, 30000); // 30 seconds timeout
        
        setPendingAlert(alertTimeout);
      } else {
        console.error('No transaction hash received. Full response:', txHash);
        alert('Transaction may have been sent but no hash received. Please check your wallet.');
        setIsBooking(false);
      }
    } catch (error) {
      console.error('Error making booking request:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        data: error.data,
        stack: error.stack
      });
      
      if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
        alert('Transaction rejected by user.');
      } else if (error.message?.includes('insufficient funds')) {
        alert('Insufficient funds to complete the transaction.');
      } else if (error.message?.includes('user rejected') || error.message?.includes('User denied')) {
        alert('Transaction rejected by user.');
      } else if (error.message?.includes('network')) {
        alert('Network error. Please check your connection and try again.');
      } else if (error.message?.includes('wallet')) {
        alert('Wallet connection error. Please check your wallet and try again.');
      } else {
        alert(`Error creating reservation: ${error.message || 'Unknown error'}. Please check your wallet connection and try again.`);
      }
      setIsBooking(false); // Set to false on error
    }
  }

  return (
    <AccessControl message="Please log in to view and make reservations.">
      <div className="container mx-auto p-4 text-white">
        {/* Notification */}
        {notification && (
          <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-md ${
            notification.type === 'success' ? 'bg-green-600' :
            notification.type === 'pending' ? 'bg-blue-600' :
            notification.type === 'warning' ? 'bg-yellow-600' :
            'bg-red-600'
          }`}>
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <p className="text-white font-medium">{notification.message}</p>
                {notification.hash && (
                  <p className="text-gray-200 text-sm mt-1 break-all">
                    Hash: {notification.hash.slice(0, 10)}...{notification.hash.slice(-8)}
                  </p>
                )}
              </div>
              <button 
                onClick={() => setNotification(null)}
                className="ml-2 text-white hover:text-gray-300"
              >
                ✕
              </button>
            </div>
          </div>
        )}

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
              disabled={isBooking || isWaitingForReceipt || !selectedAvailableTime}
              className={`w-1/3 text-white p-3 rounded mt-6 transition-colors ${
                isBooking || isWaitingForReceipt || !selectedAvailableTime
                  ? 'bg-gray-500 cursor-not-allowed' 
                  : 'bg-[#715c8c] hover:bg-[#333f63]'
              }`}
            >
              {isBooking ? 'Sending...' : 
               isWaitingForReceipt ? 'Confirming...' : 
               'Make Booking'}
            </button>
          </div>
        )}
      </div>
    </AccessControl>
  );
}