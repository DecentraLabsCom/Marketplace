"use client";
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { useUser } from '@/context/UserContext'
import { useLabs } from '@/context/LabContext'
import { useBookings } from '@/context/BookingContext'
import { useNotifications } from '@/context/NotificationContext'
import useContractWriteFunction from '@/hooks/contract/useContractWriteFunction'
import { useReservationEventCoordinator } from '@/hooks/useReservationEventCoordinator'
import { useRealTimeBookingUpdates } from '@/hooks/useRealTimeBookingUpdates'
import devLog from '@/utils/logger'
import Carrousel from '@/components/Carrousel'
import LabAccess from '@/components/LabAccess'
import AccessControl from '@/components/AccessControl'
import LabBookingItem from '@/components/LabBookingItem'
import { DashboardSectionSkeleton } from '@/components/skeletons'
import isBookingActive from '@/utils/isBookingActive'
import CalendarWithBookings from '@/components/CalendarWithBookings';

export default function UserDashboard() {
  const { isLoggedIn, address, user } = useUser();
  const { labs, loading } = useLabs();
  const { 
    userBookings, 
    bookingsLoading, 
    bookingsStatus,
    updateBookingInState,
    refreshBookings
  } = useBookings();
  const { addPersistentNotification, addErrorNotification } = useNotifications();
  const { coordinatedBookingCancellation } = useReservationEventCoordinator();

  // Enable real-time updates for booking states
  useRealTimeBookingUpdates(userBookings, isLoggedIn, refreshBookings);

  // Debug: Log booking data from BookingContext
  useEffect(() => {
    if (labs && labs.length > 0) {
      devLog.log('UserDashboard: Received labs data:', {
        labsCount: labs.length,
        address,
        labs: labs.map(lab => ({
          id: lab.id,
          name: lab.name
        }))
      });
    }
  }, [labs, address]);

  useEffect(() => {
    if (userBookings && userBookings.length > 0) {
      devLog.log('UserDashboard: Received user bookings data:', {
        userBookingsCount: userBookings.length,
        address,
        bookingsStatus,
        userBookings: userBookings.map(booking => ({
          reservationKey: booking.reservationKey,
          labId: booking.labId,
          status: booking.status
        }))
      });
    }
  }, [userBookings, address, bookingsStatus]);

  const { isConnected } = useAccount();
  
  // Contract write functions
  const { contractWriteFunction: cancelBooking } = useContractWriteFunction('cancelBooking');
  const { contractWriteFunction: cancelReservationRequest } = useContractWriteFunction('cancelReservationRequest');
  
  // Transaction state management
  const [lastTxHash, setLastTxHash] = useState(null);
  const [txType, setTxType] = useState(null); // 'cancelBooking', 'cancelReservationRequest'
  const [pendingData, setPendingData] = useState(null);
  
  // Wait for transaction receipt
  const { 
    data: receipt, 
    isSuccess: isReceiptSuccess,
    error: receiptError
  } = useWaitForTransactionReceipt({
    hash: lastTxHash,
    enabled: !!lastTxHash
  });
  
  const [userData, setUserData] = useState(null);
  const [now, setNow] = useState(null);
  const [availableLab, setAvailableLab] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLabId, setSelectedLabId] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);

  const bookingInfo = userBookings.map(booking => {
    const lab = labs.find(l => l.id === booking.labId);
    return {
      ...booking,
      labName: lab?.name ?? `Lab ${booking.labId}`,
      status: booking.status
    };
  });
  
  // State for optimistic UI updates
  const [failedCancellations, setFailedCancellations] = useState(new Set());
  
  // Initialize time on client side only
  useEffect(() => {
    setNow(new Date());
  }, []);

  // Update availableLab when labs or now changes
  useEffect(() => {
    if (labs && now) {
      const getAvailableLab = () => {
        if (!labs?.length) return null;
        // Find a lab with active bookings using userBookings from BookingContext
        const labsWithActiveBookings = labs.filter(lab => {
          const labUserBookings = userBookings?.filter(booking => booking.labId === lab.id) || [];
          return isBookingActive(labUserBookings);
        });
        return labsWithActiveBookings[0] || null;
      };
      
      const availableLab = getAvailableLab();
      setAvailableLab(availableLab);
    }
  }, [labs, now, userBookings]);
      
  const openModal = (type, labId, booking = null) => {
    setSelectedLabId(labId);
    setSelectedBooking(booking);
    setIsModalOpen(type);
  };

  const closeModal = () => {
    setIsModalOpen(null);
    setSelectedLabId(null);
    setSelectedBooking(null);
  };

  const handleClearCancellationError = (reservationKey) => {
    setFailedCancellations(prev => {
      const newSet = new Set(prev);
      newSet.delete(reservationKey);
      return newSet;
    });
  };

  const handleCancellation = async (booking) => {
    if (!booking || !booking.reservationKey) {
      devLog.error('Missing booking or reservation key:', booking);
      addErrorNotification('No booking selected or missing reservation key', '');
      return;
    }

    // Check if already canceled using direct booking status
    if (booking.status === "4" || booking.status === 4) {
      addErrorNotification('This reservation is already canceled', '');
      return;
    }

    if (!isConnected) {
      addErrorNotification('Please connect your wallet first', '');
      return;
    }

    // Clear any previous cancellation error for this booking
    setFailedCancellations(prev => {
      const newSet = new Set(prev);
      newSet.delete(booking.reservationKey);
      return newSet;
    });

    setSelectedBooking(booking);
    
    try {
      // Determine cancellation method based on booking status
      if (booking.status === "1" || booking.status === 1) {
        // BOOKED - use cancelBooking
        await handleConfirmedBookingCancellation(booking);
      } else if (booking.status === "0" || booking.status === 0) {
        // PENDING - use cancelReservationRequest
        await handleRequestedBookingCancellation(booking);
      } else {
        throw new Error('Invalid reservation state for cancellation');
      }
      
    } catch (error) {
      devLog.error('Cancellation failed:', error);
      addErrorNotification(error.message || 'Cancellation failed', '');
    }
  };

  const handleConfirmedBookingCancellation = async (booking) => {
    const bookingKey = booking.reservationKey;
    
    try {
      addPersistentNotification('info', '🔄 Please confirm the booking cancellation in your wallet...');

      // Use coordinated cancellation to prevent event collisions
      await coordinatedBookingCancellation(async () => {
        try {
          devLog.log('Using reservation key directly:', bookingKey);
          
          const txHash = await cancelBooking([bookingKey], { gas: 300000n });
          
          if (txHash) {
            // The coordinatedBookingCancellation will handle marking as cancelled
            // No need for optimistic UI state management here
            setFailedCancellations(prev => {
              const newSet = new Set(prev);
              newSet.delete(bookingKey);
              return newSet;
            });
            
            setLastTxHash(txHash);
            setTxType('cancelBooking');
            setPendingData({ booking });
            
            addPersistentNotification('info', '⏳ Transaction submitted. Waiting for confirmation...');
            return txHash;
          } else {
            throw new Error('No transaction hash received');
          }
        } catch (error) {
          devLog.error('Cancel booking error:', error);
          
          if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
            addPersistentNotification('warning', '🚫 Transaction rejected by user.');
          } else {
            // Add to failed cancellations for visual feedback
            setFailedCancellations(prev => new Set([...prev, bookingKey]));
            addErrorNotification(error, 'Booking cancellation failed: ');
          }
          throw error;
        }
      }, bookingKey, booking.labId); // Pass labId for cross-user propagation
    } catch (error) {
      // If the transaction fails immediately, don't add to canceling state
      devLog.error('Cancellation initiation failed:', error);
    }
  };

  const handleRequestedBookingCancellation = async (booking) => {
    const bookingKey = booking.reservationKey;
    
    try {
      addPersistentNotification('info', '🔄 Please confirm the request cancellation in your wallet...');

      // Use coordinated cancellation to prevent event collisions
      await coordinatedBookingCancellation(async () => {
        try {
          devLog.log('Using reservation key directly (request):', bookingKey);
          
          const txHash = await cancelReservationRequest([bookingKey], { gas: 300000n });
          
          if (txHash) {
            // The coordinatedBookingCancellation will handle marking as cancelled
            // No need for optimistic UI state management here
            setFailedCancellations(prev => {
              const newSet = new Set(prev);
              newSet.delete(bookingKey);
              return newSet;
            });
            
            setLastTxHash(txHash);
            setTxType('cancelReservationRequest');
            setPendingData({ booking });
            
            addPersistentNotification('info', '⏳ Transaction submitted. Waiting for confirmation...');
            return txHash;
          } else {
            throw new Error('No transaction hash received');
          }
        } catch (error) {
          devLog.error('Cancel reservation request error:', error);
          
          if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
            addPersistentNotification('warning', '🚫 Transaction rejected by user.');
          } else {
            // Add to failed cancellations for visual feedback
            setFailedCancellations(prev => new Set([...prev, bookingKey]));
            addErrorNotification(error, 'Request cancellation failed: ');
          }
          throw error;
        }
      }, bookingKey, booking.labId); // Pass labId for cross-user propagation
    } catch (error) {
      // If the transaction fails immediately, don't add to canceling state
      devLog.error('Cancellation initiation failed:', error);
    }
  };

  // Handle transaction confirmation
  useEffect(() => {
    if (isReceiptSuccess && receipt && txType && pendingData) {
      addPersistentNotification('success', '✅ Cancellation completed successfully!');
      
      // Transaction succeeded: DON'T remove from canceling state
      // The booking should remain showing as "Cancelled" (status 4)
      // We don't need to remove it from cancelingBookings since it should stay "Cancelled"
      
      // Reset transaction state
      setLastTxHash(null);
      setTxType(null);
      setPendingData(null);
    }
  }, [isReceiptSuccess, receipt, txType, pendingData, addPersistentNotification]);

  // Handle transaction errors
  useEffect(() => {
    if (receiptError && lastTxHash && pendingData) {
      addErrorNotification(receiptError, 'Transaction confirmation failed: ');
      
      // Transaction failed: restore booking to original state and mark as failed
      const bookingKey = pendingData.booking.reservationKey;
      const originalStatus = pendingData.booking.status;
      
      // Restore the booking to its original status using BookingContext
      updateBookingInState(bookingKey, { status: originalStatus });
      
      // Mark as failed for visual feedback
      setFailedCancellations(prev => new Set([...prev, bookingKey]));
      
      // Auto-clear failed state after 5 seconds
      setTimeout(() => {
        setFailedCancellations(prev => {
          const newSet = new Set(prev);
          newSet.delete(bookingKey);
          return newSet;
        });
      }, 5000);
      
      // Reset transaction state
      setLastTxHash(null);
      setTxType(null);
      setPendingData(null);
    }
  }, [receiptError, lastTxHash, pendingData, addErrorNotification, updateBookingInState]);

  const handleRefund = () => {
    closeModal();
  };

  // Calendar
  const today = new Date();
  const [date, setDate] = useState(new Date());

  useEffect(() => {
    if (labs && now) {
      // This useEffect was used to calculate calendar highlights,
      // but now that's handled by CalendarWithBookings component
    }
  }, [labs, now]);

  // If there is no active booking, search for the first one in the future
  const firstActiveLab = !availableLab && now && labs.length > 0
    ? labs
        .map(lab => {
          // Get user bookings for this lab from BookingContext
          const labUserBookings = userBookings?.filter(booking => booking.labId === lab.id) || [];
          if (!Array.isArray(labUserBookings)) return null;
          const futureBooking = labUserBookings
            .filter(b => b.start && parseInt(b.start) * 1000 > now.getTime())
            .sort((a, b) => parseInt(a.start) - parseInt(b.start))[0];
          return futureBooking ? { lab, booking: futureBooking } : null;
        })
        .filter(Boolean)
        .sort((a, b) => parseInt(a.booking.start) - parseInt(b.booking.start))[0]?.lab
    : null;

  // To show starting and ending times of bookings
  const getBookingTimes = booking => {
    if (!booking?.start || !booking?.end) return { start: null, end: null };
    const startDate = new Date(parseInt(booking.start) * 1000);
    const endDate = new Date(parseInt(booking.end) * 1000);
    return {
      start: `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`,
      end: `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`
    };
  };

  // Simulate user data fetching
  useEffect(() => {
    if (isLoggedIn && labs) {
      const userid = address || user?.id;
      const affiliation = user?.affiliation || 'Unknown';
      setUserData({
        userid: userid,
        affiliation: affiliation,
        labs: labs,
      });
    }
  }, [isLoggedIn, labs, address, user?.id, user?.affiliation]);

  if (!now || (!userData && loading)) {
    return (
      <AccessControl message="Please log in to view and make reservations.">
        <div className="container mx-auto p-4 space-y-6">
          <DashboardSectionSkeleton />
          <div className="flex md:flex-row flex-col gap-4">
            <div className="md:w-1/2">
              <DashboardSectionSkeleton />
            </div>
            <div className="md:w-1/2">
              <DashboardSectionSkeleton />
            </div>
          </div>
        </div>
      </AccessControl>
    )
  }

  if (loading) {
    return (
      <AccessControl message="Please log in to view your dashboard.">
        <div className="container mx-auto p-4 space-y-6">
          <DashboardSectionSkeleton />
          <div className="flex md:flex-row flex-col gap-4">
            <div className="md:w-1/2">
              <DashboardSectionSkeleton />
            </div>
            <div className="md:w-1/2">
              <DashboardSectionSkeleton />
            </div>
          </div>
        </div>
      </AccessControl>
    )
  }

  // Find active booking or the next one in the future
  const activeBooking = availableLab && userBookings
    ? userBookings
        .filter(booking => booking.labId === availableLab.id)
        .find(b => isBookingActive([b]))
    : null;

  const nextBooking = !availableLab && firstActiveLab && userBookings && now
    ? userBookings
        .filter(booking => booking.labId === firstActiveLab.id)
        .filter(b => b.start && parseInt(b.start) * 1000 > now.getTime())
        .sort((a, b) => parseInt(a.start) - parseInt(b.start))[0]
    : null;

  return (
    <AccessControl message="Please log in to view and make reservations.">
      <div className="container mx-auto p-4">
        <div className="relative bg-cover bg-center text-white py-5 
          text-center">
          <h1 className="text-3xl font-bold mb-2">User Dashboard</h1>
        </div>

        <div>
          <div className="bg-white shadow-md rounded-lg p-6 mb-6 w-1/6 h-1/3 
            hidden">
            <h2 className="text-2xl font-semibold mb-4 text-gray-800 text-center">
              Profile
            </h2>
            <p className="text-gray-700">
              <strong>Name:</strong>{userData?.name || 'N/A'}
            </p>
            <p className="text-gray-700 break-words">
              <strong>Email:</strong> {userData?.email || 'N/A'}
            </p>
          </div>

          <div className='flex-1'>
            <div className='flex min-[1280px]:flex-row flex-col'>
              <div className="border shadow text-white rounded p-6 mb-1 min-[1280px]:mr-1 min-[1280px]:w-3/4">
                <div className="flex flex-col">
                  {availableLab ? (
                    <h2 className="text-2xl font-semibold mb-4 text-white text-center">
                      Active now: {availableLab.name}
                    </h2>
                  ) : firstActiveLab ? (
                    <h2 className="text-2xl font-semibold mb-4 text-white text-center">
                      Next: {firstActiveLab.name}
                    </h2>
                  ) : null}
                  <div className='flex min-[1280px]:flex-row flex-wrap'>
                    {availableLab ? (
                      <React.Fragment key={availableLab.id}>
                        <div className='flex flex-col items-center'>
                          <div key={availableLab.id} className={`min-[1280px]:w-[320px] w-[305px] group 
                            justify-between items-center shadow-md bg-gray-200 
                            transition-transform duration-300 
                            hover:scale-105 mr-3 mb-4 p-2 h-[320px] rounded-lg flex 
                            flex-col border-4 border-[#715c8c] animate-glow`}>
                            <div className='rounded-lg h-[150px] w-full mb-4'>
                              <Carrousel lab={availableLab} maxHeight={210} />
                            </div>
                            <span className="text-gray-700 block mt-14">
                              Available today
                            </span>
                            <div className='text-gray-500 flex flex-col text-xs mr-1 
                              mb-3'>
                              <span>
                                Start time: {getBookingTimes(activeBooking).start}
                              </span>
                              <span>
                                End time: {getBookingTimes(activeBooking).end}
                              </span>
                            </div>
                            {availableLab && (
                              <LabAccess userWallet={user?.userid || address} 
                                      hasActiveBooking={!!activeBooking} 
                                      auth={availableLab.auth} />
                            )}
                          </div>
                        </div>
                        <div className={`w-full ${availableLab.docs.length > 0 ? `` : 
                          'h-[100px]'} min-[1280px]:flex-1 mb-4 flex flex-col justify-center p-2 
                          text-center rounded-lg shadow-md bg-gray-300`}>
                          {availableLab.docs && availableLab.docs.length > 0 && (
                            <div key={0} className="mt-1">
                              <iframe src={availableLab.docs[0]} title="description" 
                                height="260px" width="100%" className='rounded-lg' />
                            </div>
                          )}
                          {availableLab.docs.length === 0 && (
                            <span className="text-gray-700 text-center">
                              No documents available
                            </span>
                          )}
                          <Link href={`/lab/${availableLab.id}`} className='px-3 mt-3 py-1 
                            rounded text-sm bg-[#759ca8] hover:bg-[#5f7a91] text-white'>
                              Explore this lab
                          </Link>
                        </div>
                      </React.Fragment>
                    ) : firstActiveLab && nextBooking ? (
                      <React.Fragment key={firstActiveLab.id}>
                        <div className='flex flex-col items-center'>
                          <div key={firstActiveLab.id} className={`size-[320px] group 
                            justify-between items-center shadow-md bg-gray-200 
                            transition-transform duration-300 hover:scale-105 mr-3 mb-4
                            border-2 p-2 rounded-lg flex flex-col`}>
                            <div className='rounded-lg h-[150px] w-full mb-4'>
                              <Carrousel lab={firstActiveLab} maxHeight={210} />
                            </div>
                            <span className="text-gray-700 mt-14 block">
                              Available: {nextBooking.date}
                            </span>
                            <div className='text-gray-500 flex flex-col text-xs mr-1 mb-3'>
                              <span>Start time: {getBookingTimes(nextBooking).start}</span>
                              <span>End time: {getBookingTimes(nextBooking).end}</span>
                            </div>
                          </div>
                        </div>
                        <div className={`w-full ${firstActiveLab.docs.length > 0 ? `` : 
                          'h-[100px]'} flex-1 mb-4 flex flex-col justify-center p-2 text-center 
                          rounded-lg shadow-md bg-gray-300`}>
                          {firstActiveLab.docs && firstActiveLab.docs.length > 0 && (
                            <div key={0} className="mt-1">
                              <iframe src={firstActiveLab.docs[0]} title="description" 
                                height="260px" width="100%" className='rounded-lg' />
                            </div>
                          )}
                          {firstActiveLab.docs.length === 0 && (
                            <span className="text-gray-700 text-center">
                              No documents available
                            </span>
                          )}
                          <Link href={`/lab/${firstActiveLab.id}`} className='px-3 mt-3 py-1 
                            rounded text-sm bg-[#759ca8] hover:bg-[#5f7a91] text-white'>
                              Explore this lab
                          </Link>
                        </div>
                      </React.Fragment>
                    ) : null}
                  </div>
                  {!firstActiveLab && !availableLab && (
                    <span className="text-gray-300 text-center">
                      No upcoming or active lab
                    </span>
                  )}
                </div>
              </div>
              {/* CALENDAR */}
              <div className="border shadow text-white rounded p-6 mb-1 flex-1 min-[1280px]:w-1/4 flex justify-center 
                items-center">
                <div className="flex flex-row">
                  <CalendarWithBookings
                    selectedDate={date}
                    onDateChange={(newDate) => setDate(newDate)}
                    bookingInfo={bookingInfo}
                    minDate={today}
                    displayMode="user-dashboard"
                  />
                </div>
              </div>
            </div>
            {/* Bottom panel: upcoming and past bookings */}
            <div className="flex min-[1280px]:flex-row flex-col gap-4 mt-6">
              {/* Upcoming booked labs */}
              <div className="min-[1280px]:w-1/2 flex flex-col h-full min-h-[350px]">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-2xl font-semibold text-center flex-1">
                    Upcoming Bookings
                  </h2>
                </div>
                <ul className='w-full flex-1'>
                  {bookingsLoading ? (
                    <DashboardSectionSkeleton title={false} />
                  ) : (
                    now && userBookings && userBookings.length > 0 ? (
                      userBookings
                        .filter(booking => {
                          if (!booking.start || !booking.end) return false;
                          const endDateTime = new Date(parseInt(booking.end) * 1000);
                          return endDateTime.getTime() > now.getTime();
                        })
                        .map(booking => {
                          const lab = labs.find(l => l.id === booking.labId);
                          return {
                            ...booking,
                            lab: lab,
                            startDateTime: new Date(parseInt(booking.start) * 1000),
                            // Add visual feedback for failed cancellations
                            hasCancellationError: failedCancellations.has(booking.reservationKey)
                          };
                        })
                        .filter(booking => booking.lab) // Only include bookings with valid labs
                        .sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime())
                    .map((booking) => {
                      let startTime = null;
                      let endTime = null;

                      if (booking?.start && booking?.end) {
                        const startDateObj = new Date(parseInt(booking.start) * 1000);
                        const endDateObj = new Date(parseInt(booking.end) * 1000);

                        if (!isNaN(startDateObj.getTime()) && !isNaN(endDateObj.getTime())) {
                          const startHours = String(startDateObj.getHours()).padStart(2, '0');
                          const startMinutes = String(startDateObj.getMinutes()).padStart(2, '0');
                          startTime = `${startHours}:${startMinutes}`;
                          
                          const endHours = String(endDateObj.getHours()).padStart(2, '0');
                          const endMinutes = String(endDateObj.getMinutes()).padStart(2, '0');
                          endTime = `${endHours}:${endMinutes}`;
                        }
                      }

                      return (
                        <LabBookingItem
                          key={`${booking.lab.id}-${booking.reservationKey || booking.id}-${booking.start}`}
                          lab={booking.lab}
                          booking={booking}
                          startTime={startTime}
                          endTime={endTime}
                          onCancel={handleCancellation}
                          onClearError={handleClearCancellationError}
                          isModalOpen={false}
                          closeModal={closeModal}
                        />
                      );
                    })
                    ) : (
                      <li className="text-center text-gray-500 py-8">
                        No upcoming bookings found.
                      </li>
                    )
                  )}
                  {!now && !bookingsLoading && <li className="text-center text-gray-500">Loading...</li>}
                </ul>
              </div>
              {/* Vertical divider */}
              <div className="min-[1280px]:mt-1 min-[1280px]:mx-3 min-[1280px]:w-px min-[1280px]:self-stretch bg-gradient-to-tr 
                from-transparent via-neutral-800 to-transparent opacity-90 
                dark:via-neutral-200 border-l border-neutral-800 
                dark:border-neutral-200 border-dashed"
                style={{ borderWidth: '4px', borderLeftStyle: 'dashed' }} />
              {/* Past booked labs */}
              <div className="min-[1280px]:w-1/2 flex flex-col h-full min-h-[350px]">
                <h2 className="text-2xl font-semibold mb-4 text-center">
                  Past bookings
                </h2>
                <ul className='w-full flex-1'>
                  {bookingsLoading ? (
                    <DashboardSectionSkeleton title={false} />
                  ) : (
                    now && userBookings && userBookings.length > 0 ? (
                      userBookings
                        .filter(booking => {
                          if (!booking.start || !booking.end) return false;
                          const endDateTime = new Date(parseInt(booking.end) * 1000);
                          // Only include past bookings that were confirmed (not PENDING)
                          const hasReservationKey = booking.reservationKey;
                          const wasPending = booking.status === "0" || booking.status === 0;
                          return endDateTime.getTime() <= now.getTime() && hasReservationKey && !wasPending;
                        })
                        .map(booking => {
                          const lab = labs.find(l => l.id === booking.labId);
                          return {
                            ...booking,
                            lab: lab,
                            startDateTime: new Date(parseInt(booking.start) * 1000)
                          };
                        })
                        .filter(booking => booking.lab) // Only include bookings with valid labs
                        .sort((a, b) => b.startDateTime.getTime() - a.startDateTime.getTime()) // Most recent first
                        .map((booking) => {
                          let startTime = null;
                          let endTime = null;

                          if (booking?.start && booking?.end) {
                            const startDateObj = new Date(parseInt(booking.start) * 1000);
                            const endDateObj = new Date(parseInt(booking.end) * 1000);

                            if (!isNaN(startDateObj.getTime()) && !isNaN(endDateObj.getTime())) {
                              const startHours = String(startDateObj.getHours()).padStart(2, '0');
                              const startMinutes = String(startDateObj.getMinutes()).padStart(2, '0');
                              startTime = `${startHours}:${startMinutes}`;
                              
                              const endHours = String(endDateObj.getHours()).padStart(2, '0');
                              const endMinutes = String(endDateObj.getMinutes()).padStart(2, '0');
                              endTime = `${endHours}:${endMinutes}`;
                            }
                          }

                          return (
                            <LabBookingItem
                              key={`${booking.lab.id}-${booking.reservationKey || booking.id}-${booking.start}`}
                              lab={booking.lab}
                              booking={booking}
                              startTime={startTime}
                              endTime={endTime}
                              onRefund={(labId, booking) => openModal('refund', labId, booking)}
                              onConfirmRefund={handleRefund}
                              isModalOpen={isModalOpen === 'refund' && selectedLabId === booking.lab.id && selectedBooking?.reservationKey === booking.reservationKey}
                              closeModal={closeModal}
                            />
                          );
                        })
                    ) : (
                      <li className="text-center text-gray-500 py-8">
                        No past bookings found.
                      </li>
                    )
                  )}
                  {!now && !bookingsLoading && <li className="text-center text-gray-500">Loading...</li>}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AccessControl>
  )
}
