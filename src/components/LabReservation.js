"use client";
import React, { useState, useEffect } from "react";
import { useAccount, useWaitForTransactionReceipt } from 'wagmi';
import { useLabs } from "@/context/LabContext";
import { useBookings } from "@/context/BookingContext";
import { useUser } from "@/context/UserContext";
import { useReservationEvents } from "@/context/BookingEventContext";
import { useNotifications } from "@/context/NotificationContext";
import { useLabToken } from "@/hooks/useLabToken";
import { useLabBookings } from "@/hooks/useLabBookings";
import Carrousel from "@/components/Carrousel";
import AccessControl from '@/components/AccessControl';
import LabTokenInfo from '@/components/LabTokenInfo';
import { generateTimeOptions } from '@/utils/labBookingCalendar';
import CalendarWithBookings from '@/components/CalendarWithBookings';
import useContractWriteFunction from "@/hooks/contract/useContractWriteFunction";
import { contractAddresses } from "@/contracts/diamond";
import devLog from '@/utils/logger';

export default function LabReservation({ id }) {
  const { labs } = useLabs();
  const { fetchUserBookings } = useBookings();
  const { isSSO } = useUser();
  const { processingReservations } = useReservationEvents();
  const { addTemporaryNotification, addErrorNotification } = useNotifications();
  const { chain, isConnected } = useAccount();
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(15);
  const [selectedAvailableTime, setSelectedAvailableTime] = useState('');
  const [selectedLab, setSelectedLab] = useState(null);
  const [isClient, setIsClient] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  
  // Transaction state management (modernized pattern)
  const [lastTxHash, setLastTxHash] = useState(null);
  const [txType, setTxType] = useState(null); // 'reservation', 'approval'
  const [pendingData, setPendingData] = useState(null);
  
  // Lab bookings hook for the current lab
  const {
    labBookings,
    isLoading: isLoadingLabBookings,
    error: labBookingsError,
    refetch: refetchLabBookings
  } = useLabBookings(selectedLab?.id);
  
  // Lab token hook for payment handling
  const { 
    calculateReservationCost, 
    checkBalanceAndAllowance, 
    approveLabTokens, 
    formatTokenAmount: formatBalance,
    formatPrice,
    refreshTokenData
  } = useLabToken();
  
  const { contractWriteFunction: reservationRequest } = useContractWriteFunction('reservationRequest');
  
  // Wait for transaction receipt
  const { 
    data: receipt, 
    isLoading: isWaitingForReceipt, 
    isSuccess: isReceiptSuccess,
    isError: isReceiptError,
    error: receiptError
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
      bookingInfo: (labBookings || []).filter(booking => 
        booking.status !== "4" && booking.status !== 4 // Exclude cancelled bookings
      )
    });
    const firstAvailable = availableTimes.find(t => !t.disabled);
    setSelectedAvailableTime(firstAvailable ? firstAvailable.value : '');
  }, [date, time, selectedLab, labBookings.length]); // Use labBookings.length to avoid infinite loops

  // To avoid hydration warning in SSR
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Calculate total cost for the reservation
  const totalCost = selectedLab ? calculateReservationCost(selectedLab.price, time) : 0n;

  // Handle transaction confirmation and errors
  useEffect(() => {
    if (isReceiptSuccess && receipt && txType && pendingData) {
      // Show confirmation message when transaction is completed
      addTemporaryNotification('pending', '⏳ Reservation requested. Waiting for confirmation...');
      
      setIsBooking(false);
      
      // Refresh token data for wallet users to update allowance/balance
      if (!isSSO) {
        refreshTokenData();
      }
      
      // Invalidate cache and refresh bookings to show the new reservation immediately
      const invalidateAndRefresh = async () => {
        try {
          // Invalidate the bookings cache
          await fetch('/api/contract/reservation/invalidateCache', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              reason: 'new_reservation',
              reservationKey: pendingData?.reservationKey
            })
          });
          
          // Force refresh the bookings data
          await fetchUserBookings(true); // Refresh user bookings
          await refetchLabBookings(); // Refresh lab bookings
          
          devLog.log('Cache invalidated and bookings refreshed after new reservation');
        } catch (error) {
          devLog.error('Error invalidating cache after reservation:', error);
          // Still try to refresh bookings even if cache invalidation fails
          fetchUserBookings(true); // Refresh user bookings
          refetchLabBookings(); // Refresh lab bookings
        }
      };
      
      invalidateAndRefresh();
      
      // Reset transaction state
      setLastTxHash(null);
      setTxType(null);
      setPendingData(null);

      // The ReservationEventContext will handle updating bookings when confirmed/denied
    }
  }, [isReceiptSuccess, receipt, txType, pendingData, addTemporaryNotification, isSSO, fetchUserBookings, refreshTokenData]);

  // Handle transaction errors
  useEffect(() => {
    if (isReceiptError && receiptError && lastTxHash) {    
      // Show error notification
      addErrorNotification(receiptError, 'Transaction error: ');
      
      // Reset booking state
      setIsBooking(false);
      
      // Reset transaction state
      setLastTxHash(null);
      setTxType(null);
      setPendingData(null);
    }
  }, [isReceiptError, receiptError, lastTxHash, addErrorNotification]);

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
        bookingInfo: (labBookings || []).filter(booking => 
          booking.status !== "4" && booking.status !== 4 // Exclude cancelled bookings
        )
      })
    : [];

  // Change lab
  const handleLabChange = (e) => {
    const selectedId = e.target.value;
    const lab = labs.find((lab) => lab.id == selectedId);
    setSelectedLab(lab);
  };

  // Common notification and state management
  const handleBookingSuccess = () => {
    fetchUserBookings(true); // Update user bookings (force refresh)
    refetchLabBookings(); // Update lab bookings
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

      // Show success notification
      handleBookingSuccess();
    } catch (error) {
      addErrorNotification(error, 'Failed to create reservation: ');
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
      addTemporaryNotification('error', 
        `❌ Contract not deployed on ${chain?.name || 'this network'}. Please switch to a supported network.`);
      return;
    }

    const bookingData = validateAndCalculateBooking();
    if (!bookingData) return;

    const { labId, start, timeslot } = bookingData;
    const end = start + timeslot; // Wallet booking needs end time

    // Calculate cost and validate payment using improved function
    const cost = totalCost;
    if (cost <= 0) {
      addTemporaryNotification('error', '❌ Unable to calculate booking cost.');
      return;
    }

    // Use improved balance checking function
    const paymentCheck = checkBalanceAndAllowance(cost);
    
    if (!paymentCheck.hasSufficientBalance) {
      addTemporaryNotification('error', 
        `❌ Insufficient LAB tokens. Required: ${formatBalance(cost)} LAB, Available: ${formatBalance(paymentCheck.balance)} LAB`);
      return;
    }

    setIsBooking(true);

    try {
      // Step 1: Handle token approval if needed (only show notification if approval is actually needed)
      if (!paymentCheck.hasSufficientAllowance) {
        addTemporaryNotification('pending', '⏳ Approving LAB tokens...');
        
        try {
          await approveLabTokens(cost);
          addTemporaryNotification('success', '✅ LAB tokens approved successfully!');
        } catch (approvalError) {
          devLog.error('Token approval failed:', approvalError);
          if (approvalError.code === 4001 || approvalError.code === 'ACTION_REJECTED') {
            addTemporaryNotification('warning', '🚫 Token approval rejected by user.');
          } else {
            addErrorNotification(approvalError, 'Token approval failed: ');
          }
          setIsBooking(false);
          return;
        }
      }

      // Step 2: Make the reservation with payment
      addTemporaryNotification('pending', '⏳ Sending reservation request with payment...');
      
      // Final validation: check if the time slot is still available right before transaction
      const finalAvailableTimes = generateTimeOptions({
        date,
        interval: time,
        bookingInfo: (labBookings || []).filter(booking => 
          booking.status !== "4" && booking.status !== 4
        )
      });
      
      const slotStillAvailable = finalAvailableTimes.find(t => t.value === selectedAvailableTime && !t.disabled);
      if (!slotStillAvailable) {
        addTemporaryNotification('error', 
          '❌ The selected time slot is no longer available. Please select a different time.');
        setIsBooking(false);
        return;
      }
      
      // Call contract - pass arguments as array
      const txHash = await reservationRequest([labId, start, end]);
      
      if (txHash) {
        setLastTxHash(txHash);
        setTxType('reservation');
        setPendingData({ labId, start, end, timeslot, cost });
        addTemporaryNotification('success', 
          `✅ Payment of ${formatBalance(cost)} LAB sent! Confirming transaction...`);
      } else {
        addTemporaryNotification('warning', 
          '⚠️ Transaction may have been sent but no hash received. Please check your wallet.');
        setIsBooking(false);
      }
    } catch (error) {
      devLog.error('Error making booking request:', error);
      
      // More specific error handling
      if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
        addTemporaryNotification('warning', '🚫 Transaction rejected by user.');
      } else if (error.message?.includes('execution reverted')) {
        addTemporaryNotification('error', 
          '❌ Transaction failed: The reservation request was reverted. This could be due to timing conflicts or the time slot becoming unavailable. Please try again.');
      } else if (error.message?.includes('insufficient funds')) {
        addTemporaryNotification('error', '❌ Insufficient funds for gas or tokens.');
      } else {
        addErrorNotification(error, 'Reservation creation failed: ');
      }
      
      setIsBooking(false); // Set to false on error
    }
  };

  return (
    <AccessControl message="Please log in to view and make reservations.">
      <div className="container mx-auto p-4 text-white">
        <div className="relative bg-cover bg-center text-white py-5 text-center">
          <h1 className="text-3xl font-bold mb-2">Book your Lab now!</h1>
          <div className="mt-2 h-6 flex items-center justify-center">
            {processingReservations.size > 0 && (
              <span className="text-yellow-300">
                ⏳ Processing {processingReservations.size} reservation{processingReservations.size > 1 ? 's' : ''}...
              </span>
            )}
          </div>
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
          <div className="flex flex-col min-[1280px]:flex-row gap-6 p-4 min-[1280px]:items-stretch">
            <div className="min-[1280px]:w-1/2 flex flex-col items-center justify-center">
              <div className="w-full flex-1 flex items-center justify-center min-h-[400px]">
                <Carrousel lab={selectedLab} />
              </div>
            </div>

            <div className="min-[1280px]:w-1/2 flex flex-col justify-between">
              <p className="text-white text-base text-justify mb-2">{selectedLab.description}</p>

              <div className="flex flex-col lg:flex-row gap-8 items-start">
                <div className="w-full lg:w-72 flex flex-col items-center lg:items-start">
                  <label className="block text-lg font-semibold mb-2">Select the date:</label>
                  <div className="w-fit">
                    <CalendarWithBookings
                      selectedDate={date}
                      onDateChange={(newDate) => setDate(newDate)}
                      bookingInfo={(labBookings || []).map(booking => ({
                        ...booking,
                        labName: selectedLab?.name,
                        status: booking.status
                      }))}
                      minDate={minDate}
                      maxDate={maxDate}
                      displayMode="lab-reservation"
                    />
                  </div>
                </div>
                <div className="w-full lg:w-72 flex flex-col gap-6">
                  <div>
                    <label className="block text-lg font-semibold mb-2">Duration:</label>
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
                  <div>
                    <label className="block text-lg font-semibold mb-2">Starting time:</label>
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
                {!isSSO && (
                  <div className="w-full lg:w-96 flex flex-col">
                    <label className="block text-lg font-semibold mb-2">Payment info:</label>
                    <LabTokenInfo 
                      className="h-fit"
                      labPrice={selectedLab.price}
                      durationMinutes={time}
                    />
                    <p className="text-[#335763] font-semibold text-xl mt-4 text-center">{formatPrice(selectedLab.price)} $LAB / hour</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {selectedLab && (
          <>
            <div className="flex flex-col items-center">
              <button
                onClick={handleBooking} 
                disabled={isBooking || (isWaitingForReceipt && !isSSO && !isReceiptError) || !selectedAvailableTime}
                className={`w-1/3 text-white p-3 rounded mt-6 transition-colors ${
                  isBooking || (isWaitingForReceipt && !isSSO && !isReceiptError) || !selectedAvailableTime
                    ? 'bg-gray-500 cursor-not-allowed' 
                    : 'bg-[#715c8c] hover:bg-[#333f63]'
                }`}
              >
                {isBooking ? (isSSO ? 'Processing...' : 'Sending...') : 
                 (isWaitingForReceipt && !isSSO && !isReceiptError) ? 'Confirming...' :
                 isReceiptError ? 'Try Again' :
                 'Make Booking'}
              </button>
              {isLoadingLabBookings && selectedLab && (
                <div className="mt-2 text-blue-300">
                  📅 Loading reservations for lab {selectedLab.name}...
                </div>
              )}
              {labBookingsError && (
                <div className="mt-2 text-red-300">
                  ❌ Error loading lab reservations: {labBookingsError}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AccessControl>
  );
}
