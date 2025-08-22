"use client";
import React, { useState, useEffect, useMemo } from 'react'
import PropTypes from 'prop-types'
import { useAccount, useWaitForTransactionReceipt } from 'wagmi'
import { useUser } from '@/context/UserContext'
import { useNotifications } from '@/context/NotificationContext'
import { useAllLabsComposed } from '@/hooks/lab/useLabs'
import { 
  useReservationRequest, 
  useBookingCacheUpdates,
  useLabBookingsComposed 
} from '@/hooks/booking/useBookings'
import { useLabToken } from '@/context/LabTokenContext'
import { isCancelledBooking } from '@/utils/booking/bookingStatus'
import AccessControl from '@/components/auth/AccessControl'
import Carrousel from '@/components/ui/Carrousel'
import LabTokenInfo from '@/components/reservation/LabTokenInfo'
import CalendarWithBookings from '@/components/booking/CalendarWithBookings'
import { contractAddresses } from '@/contracts/diamond'
import { generateTimeOptions } from '@/utils/booking/labBookingCalendar'
import devLog from '@/utils/dev/logger'

/**
 * Main lab reservation component that handles booking creation and management
 * Integrates with calendar, pricing, blockchain transactions, and booking state
 * @param {Object} props
 * @param {string|number} [props.id] - Lab ID to display reservation interface for (optional)
 * @returns {JSX.Element} Complete lab reservation interface with calendar and booking controls
 */
export default function LabReservation({ id }) {
  // Validate and normalize the ID
  const labId = id ? String(id) : null;
  
  const { 
    data: labsData,
    isError: labsError,
    error: labsErrorDetails 
  } = useAllLabsComposed();
  const labs = labsData?.labs || [];
  const { isSSO, address: userAddress } = useUser();
  const { addTemporaryNotification, addErrorNotification } = useNotifications();
  const { chain, isConnected, address } = useAccount();
  
  // Cache update hooks
  const bookingCacheUpdates = useBookingCacheUpdates();
  
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(15);
  const [selectedAvailableTime, setSelectedAvailableTime] = useState('');
  const [selectedLab, setSelectedLab] = useState(null);
  const [isClient, setIsClient] = useState(false);
  const [isBooking, setIsBooking] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(0); // For forcing UI refreshes
  
  // Transaction state management (modernized pattern)
  const [lastTxHash, setLastTxHash] = useState(null);
  const [txType, setTxType] = useState(null); // 'reservation', 'approval'
  const [pendingData, setPendingData] = useState(null);
  
  // 🚀 React Query for lab bookings
  const {
    data: labBookingsData,
    isLoading: labBookingsLoading,
    error: labBookingsError
  } = useLabBookingsComposed(selectedLab?.id, {
    queryOptions: {
      enabled: !!selectedLab?.id
    }
  });
  const labBookings = useMemo(() => 
    labBookingsData?.bookings || [], 
    [labBookingsData?.bookings]
  );

  // Lab token hook for payment handling
  const { 
    calculateReservationCost, 
    checkBalanceAndAllowance, 
    approveLabTokens, 
    formatTokenAmount: formatBalance,
    formatPrice,
    refreshTokenData
  } = useLabToken();
  
  // 🚀 React Query mutation for booking creation
  const reservationRequestMutation = useReservationRequest();
  
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

  /**
   * Safely parse a timestamp to a Date object
   * @param {any} timestamp - The timestamp to parse (can be string, number, null, undefined)
   * @param {Date} fallback - Fallback date if parsing fails
   * @returns {Date} Valid Date object
   */
  const safeParseDate = (timestamp, fallback = new Date()) => {
    if (!timestamp) return fallback;
    
    try {
      let parsedDate;
      
      // If it's already a number (timestamp in seconds), convert to milliseconds
      if (typeof timestamp === 'number') {
        parsedDate = new Date(timestamp * 1000);
      }
      // If it's a string that looks like a unix timestamp
      else if (typeof timestamp === 'string' && /^\d+$/.test(timestamp)) {
        parsedDate = new Date(parseInt(timestamp) * 1000);
      }
      // Otherwise try to parse directly
      else {
        parsedDate = new Date(timestamp);
      }
      
      // Check if the date is valid
      if (isNaN(parsedDate.getTime())) {
        devLog.warn('Invalid date parsed:', timestamp, 'using fallback:', fallback);
        return fallback;
      }
      
      return parsedDate;
    } catch (error) {
      devLog.warn('Error parsing date:', timestamp, error, 'using fallback:', fallback);
      return fallback;
    }
  };

  const parseDate = (str) => {
    if (!str) return new Date();
    const [month, day, year] = str.split("/");
    return new Date(`${year}-${month}-${day}`);
  };

  // Use useMemo to find the lab from URL parameter to avoid infinite re-renders
  const foundLab = useMemo(() => {
    if (labs.length && labId) {
      return labs.find((lab) => lab.id == labId) || null;
    }
    return null;
  }, [labs.length, labId]); // Use labs.length instead of labs array to avoid recreation

  // Update selectedLab when foundLab changes (only when there's a prop labId, don't interfere with manual selection)
  useEffect(() => {
    if (foundLab && labId) {
      setSelectedLab(foundLab);
    }
    // Note: Don't reset selectedLab to null when no labId - allow manual selection via dropdown
  }, [foundLab, labId]);

  // Update the time interval when the selected lab changes
  useEffect(() => {
    if (selectedLab && Array.isArray(selectedLab.timeSlots) && selectedLab.timeSlots.length > 0) {
      setTime(selectedLab.timeSlots[0]);
    }
  }, [selectedLab]);

  // Update calendar date to lab opening date if it's in the future
  useEffect(() => {
    if (selectedLab && selectedLab.opens) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const opensDate = safeParseDate(selectedLab.opens, today);
      
      if (opensDate > today) {
        setDate(opensDate);
      }
    }
  }, [selectedLab]);

  // Select the first available time when the available times change
  useEffect(() => {
    if (!selectedLab) return;
    const availableTimes = generateTimeOptions({
      date,
      interval: time,
      bookingInfo: (labBookings || []).filter(booking => 
        !isCancelledBooking(booking) // Exclude cancelled bookings
      )
    });
    const firstAvailable = availableTimes.find(t => !t.disabled);
    const newSelectedTime = firstAvailable ? firstAvailable.value : '';
    
    // Only update if the current selection is no longer available
    if (selectedAvailableTime && !availableTimes.find(t => t.value === selectedAvailableTime && !t.disabled)) {
      setSelectedAvailableTime(newSelectedTime);
    } else if (!selectedAvailableTime) {
      setSelectedAvailableTime(newSelectedTime);
    }
  }, [date, time, selectedLab, labBookings?.length, selectedAvailableTime]);

  // Force refresh of selected time when forceRefresh changes
  useEffect(() => {
    if (!selectedLab || forceRefresh === 0) return;
    
    const availableTimes = generateTimeOptions({
      date,
      interval: time,
      bookingInfo: (labBookings || []).filter(booking => 
        !isCancelledBooking(booking)
      )
    });
    
    // Revalidate current selection
    const currentlySelected = availableTimes.find(t => t.value === selectedAvailableTime);
    if (!currentlySelected || currentlySelected.disabled) {
      const firstAvailable = availableTimes.find(t => !t.disabled);
      setSelectedAvailableTime(firstAvailable ? firstAvailable.value : '');
    }
  }, [forceRefresh, selectedLab, date, time, labBookings, selectedAvailableTime]);

  // To avoid hydration warning in SSR
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Calculate total cost for the reservation
  const totalCost = selectedLab ? calculateReservationCost(selectedLab.price, time) : 0n;

  // Handle transaction confirmation and errors
  useEffect(() => {
    if (isReceiptSuccess && receipt && lastTxHash) {
      // Show confirmation message when transaction is actually confirmed on-chain
      addTemporaryNotification('success', '✅ Transaction confirmed on-chain! Your reservation is now being processed.');
      
      setIsBooking(false);
      
      // Refresh token data for wallet users to update allowance/balance
      if (!isSSO) {
        refreshTokenData();
      }
      
      // Force UI refresh for immediate visual feedback
      setForceRefresh(prev => prev + 1);
      
      // Reset transaction state
      setLastTxHash(null);
      setTxType(null);
      setPendingData(null);

      // The BookingEventContext will handle updating bookings automatically via blockchain events
      // No manual cache invalidation needed - our granular cache strategy handles this
      devLog.log('✅ Transaction confirmed on blockchain - BookingEventContext will process the ReservationRequested event');
    }
  }, [isReceiptSuccess, receipt, lastTxHash, addTemporaryNotification, isSSO, refreshTokenData]);

  // Handle transaction errors
  useEffect(() => {
    if (isReceiptError && receiptError && lastTxHash) {    
      // Show concise error notification
      addErrorNotification(receiptError, 'Transaction');
      
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
  const opensDate = selectedLab ? safeParseDate(selectedLab.opens, today) : today;
  const minDate = opensDate > today ? opensDate : today;
  const maxDate = selectedLab ? safeParseDate(selectedLab.closes) : undefined;

  // Available times for the selected day and lab
  const availableTimes = selectedLab
    ? generateTimeOptions({
        date,
        interval: time,
        bookingInfo: (labBookings || []).filter(booking => 
          !isCancelledBooking(booking) // Exclude cancelled bookings
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
  const handleBookingSuccess = async () => {
    // Force UI refresh for immediate calendar update
    setForceRefresh(prev => prev + 1);
    setIsBooking(false);
    
    // BookingEventContext will handle the granular cache updates automatically
    devLog.log('✅ Booking success - relying on BookingEventContext for cache updates');
  };

  // Optimistic cache update for immediate UI feedback
  const addOptimisticBooking = (bookingData) => {
    const { labId, start, timeslot, cost, optimisticBookingId } = bookingData;
    const userAddr = address || userAddress || 'current_user';

    // Use the granular cache updates for optimistic updates
    try {
      const optimisticBookingData = {
        id: optimisticBookingId,
        labId,
        userAddress: userAddr,
        startTime: start.toISOString(),
        endTime: new Date(start.getTime() + (timeslot * 60 * 1000)).toISOString(),
        cost,
        status: 'pending',
        timestamp: new Date().toISOString(),
        isOptimistic: true
      };

      // Add to user's bookings cache
      bookingCacheUpdates.addBookingToUserCache(optimisticBookingData, userAddr);
      
      // Add to lab's bookings cache
      if (labId) {
        bookingCacheUpdates.addBookingToLabCache(optimisticBookingData, labId);
      }

      // Force UI refresh for immediate calendar update
      setForceRefresh(prev => prev + 1);
      
      return optimisticBookingData;
    } catch (error) {
      devLog.warn('Optimistic cache update failed:', error);
      return null;
    }
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
      // 🚀 Use React Query mutation for SSO booking creation
      await reservationRequestMutation.mutateAsync({
        tokenId: labId,
        start,
        end: start + timeslot
      });

      // Show success notification
      addTemporaryNotification('success', '✅ Reservation created!');
      await handleBookingSuccess();
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
          addTemporaryNotification('success', '✅ Tokens approved!');
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

      // Step 2: Make the reservation with payment using React Query mutation
      addTemporaryNotification('pending', '⏳ Sending reservation request with payment...');
      
      // Final validation: check if the time slot is still available right before transaction
      const finalAvailableTimes = generateTimeOptions({
        date,
        interval: time,
        bookingInfo: (labBookings || []).filter(booking => 
          !isCancelledBooking(booking)
        )
      });
      
      const slotStillAvailable = finalAvailableTimes.find(t => t.value === selectedAvailableTime && !t.disabled);
      if (!slotStillAvailable) {
        addTemporaryNotification('error', 
          '❌ The selected time slot is no longer available. Please select a different time.');
        setIsBooking(false);
        return;
      }
      
      // 🚀 Use React Query mutation for booking creation and capture transaction hash
      const result = await reservationRequestMutation.mutateAsync({
        tokenId: labId,
        start,
        end: start + timeslot
      });
      
      // Capture transaction hash for receipt monitoring
      if (result?.hash) {
        setLastTxHash(result.hash);
        setTxType('reservation');
        setPendingData({ labId, start, timeslot, cost });
        
        // Show initial success notification (transaction sent)
        addTemporaryNotification('pending', '⏳ Reservation transaction sent. Waiting for blockchain confirmation...');
      } else {
        // Fallback success notification if no hash (shouldn't happen with wallet transactions)
        addTemporaryNotification('success', 
          `✅ Reservation created successfully! Payment of ${formatBalance(cost)} LAB processed.`);
        await handleBookingSuccess();
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

  // ❌ Error handling for React Query
  if (labsError) {
    return (
      <AccessControl message="Please log in to view and make reservations.">
        <div className="container mx-auto p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
            <h2 className="text-red-800 text-xl font-semibold mb-2">Error Loading Labs</h2>
            <p className="text-red-600 mb-4">
              {labsErrorDetails?.message || 'Failed to load laboratory data'}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </AccessControl>
    );
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
                    {/* Calendar booking info preparation (no debug logs to reduce spam) */}
                    <CalendarWithBookings
                      key={`calendar-${selectedLab?.id}-${labBookings?.length || 0}-${forceRefresh}-${date.getTime()}-${JSON.stringify(labBookings?.map(b => b.reservationKey) || [])}`}
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
                      {(selectedLab?.timeSlots || [15, 30, 60]).map((slot) => (
                        <option key={slot} value={slot}>{slot} minutes</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-lg font-semibold mb-2">Starting time:</label>
                    <select
                      key={`time-dropdown-${selectedLab?.id}-${labBookings?.length || 0}-${forceRefresh}-${date.getTime()}`}
                      className={`w-full p-3 border-2 ${availableTimes.some(t => !t.disabled) ? 
                        'bg-gray-800 text-white' : 'bg-gray-600 text-gray-400'} rounded`}
                      value={selectedAvailableTime}
                      onChange={e => setSelectedAvailableTime(e.target.value)}
                      disabled={!availableTimes.some(t => !t.disabled)}
                    >
                      {availableTimes.map((timeOption, i) => (
                        <option
                          key={`${timeOption.value}-${i}`}
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
                    : 'bg-brand hover:bg-[#333f63]'
                }`}
              >
                {isBooking ? (isSSO ? 'Processing...' : 'Sending...') : 
                 (isWaitingForReceipt && !isSSO && !isReceiptError) ? 'Confirming...' :
                 isReceiptError ? 'Try Again' :
                 'Make Booking'}
              </button>
            </div>
          </>
        )}
      </div>
    </AccessControl>
  );
}

LabReservation.propTypes = {
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
}
