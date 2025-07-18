"use client";
import React, { useEffect, useState } from 'react'
import DatePicker from "react-datepicker"
import Link from 'next/link'
import { useWaitForTransactionReceipt, useAccount } from 'wagmi'
import { useUser } from '@/context/UserContext'
import { useLabs } from '@/context/LabContext'
import { useNotifications } from '@/context/NotificationContext'
import useContractWriteFunction from '@/hooks/contract/useContractWriteFunction'
import { useReservationEventCoordinator } from '@/hooks/useReservationEventCoordinator'
import Carrousel from '@/components/Carrousel'
import LabAccess from '@/components/LabAccess'
import AccessControl from '@/components/AccessControl'
import LabBookingItem from '@/components/LabBookingItem'
import { DashboardSectionSkeleton } from '@/components/skeletons'
import isBookingActive from '@/utils/isBookingActive'
import { renderDayContents } from '@/utils/labBookingCalendar';

export default function UserDashboard() {
  const { isLoggedIn, address, user } = useUser();
  const { labs, loading, bookingsLoading } = useLabs();
  const { addPersistentNotification, addErrorNotification } = useNotifications();
  const { coordinatedBookingCancellation } = useReservationEventCoordinator();
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
  
  // Initialize time on client side only
  useEffect(() => {
    const currentTime = new Date();
    setNow(currentTime);
  }, []);

  // Update availableLab when labs or now changes
  useEffect(() => {
    if (labs && now) {
      const lab = labs.find(lab => lab.userBookings && isBookingActive(lab.userBookings));
      setAvailableLab(lab);
    }
  }, [labs, now]);
      
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

  const handleCancellation = async (booking) => {
    if (!booking || !booking.reservationKey) {
      console.error('Missing booking or reservation key:', booking);
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
      console.error('Cancellation failed:', error);
      addErrorNotification(error.message || 'Cancellation failed', '');
    }
  };

  const handleConfirmedBookingCancellation = async (booking) => {
    addPersistentNotification('info', '🔄 Please confirm the booking cancellation in your wallet...');

    // Use coordinated cancellation to prevent event collisions
    await coordinatedBookingCancellation(async () => {
      try {
        const txHash = await cancelBooking([booking.reservationKey], { gas: 300000n });
        
        if (txHash) {
          setLastTxHash(txHash);
          setTxType('cancelBooking');
          setPendingData({ booking });
          return txHash;
        } else {
          throw new Error('No transaction hash received');
        }
      } catch (error) {
        console.error('Cancel booking error:', error);
        if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
          addPersistentNotification('warning', '🚫 Transaction rejected by user.');
        } else {
          addErrorNotification(error, 'Booking cancellation failed: ');
        }
        throw error;
      }
    }, booking.reservationKey);
  };

  const handleRequestedBookingCancellation = async (booking) => {
    addPersistentNotification('info', '🔄 Please confirm the request cancellation in your wallet...');

    // Use coordinated cancellation to prevent event collisions
    await coordinatedBookingCancellation(async () => {
      try {
        const txHash = await cancelReservationRequest([booking.reservationKey], { gas: 300000n });
        
        if (txHash) {
          setLastTxHash(txHash);
          setTxType('cancelReservationRequest');
          setPendingData({ booking });
          return txHash;
        } else {
          throw new Error('No transaction hash received');
        }
      } catch (error) {
        console.error('Cancel reservation request error:', error);
        if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
          addPersistentNotification('warning', '🚫 Transaction rejected by user.');
        } else {
          addErrorNotification(error, 'Request cancellation failed: ');
        }
        throw error;
      }
    }, booking.reservationKey);
  };

  // Handle transaction confirmation
  useEffect(() => {
    if (isReceiptSuccess && receipt && txType && pendingData) {
      addPersistentNotification('success', '✅ Cancellation completed successfully!');
      
      // Reset transaction state
      setLastTxHash(null);
      setTxType(null);
      setPendingData(null);
    }
  }, [isReceiptSuccess, receipt, txType, pendingData, addPersistentNotification]);

  // Handle transaction errors
  useEffect(() => {
    if (receiptError && lastTxHash) {
      addErrorNotification(receiptError, 'Transaction confirmation failed: ');
      
      // Reset transaction state
      setLastTxHash(null);
      setTxType(null);
      setPendingData(null);
    }
  }, [receiptError, lastTxHash, addErrorNotification]);

  const handleRefund = () => {
    closeModal();
  };

  // Calendar
  const today = new Date();
  const [date, setDate] = useState(new Date());
  const [bookedDates, setBookedDates] = useState([]);
  const dayContents = (day, currentDateRender) =>
    renderDayContents({
      day,
      currentDateRender,
      bookingInfo: labs.flatMap(lab =>
        (lab.bookingInfo || [])
          .filter(booking => booking.status !== "4" && booking.status !== 4) // Exclude cancelled bookings
          .map(booking => ({
            ...booking,
            labName: lab.name,
            status: booking.status // Ensure status is included for styling
          }))
      ),
    });

  useEffect(() => {
    if (labs && now) {
      const futureBookingDates = labs.reduce((dates, lab) => {
        if (Array.isArray(lab.userBookings)) {
          lab.userBookings
            .filter(booking => {
              if (!booking.date || !booking.time || !booking.minutes) return false;
              // Exclude cancelled bookings from calendar highlights
              if (booking.status === "4" || booking.status === 4) return false;
              const endDateTime = new Date(`${booking.date}T${booking.time}`);
              endDateTime.setMinutes(endDateTime.getMinutes() + parseInt(booking.minutes));
              return endDateTime.getTime() > now.getTime();
            })
            .forEach(booking => {
              try {
                const dateObject = new Date(booking.date);
                if (!isNaN(dateObject)) {
                  dates.push(dateObject);
                }
              } catch (error) {
                console.error("Error converting date:", booking.date, error);
              }
            });
        }
        return dates;
      }, []);
      setBookedDates(futureBookingDates);
    }
  }, [labs, now]);

  // If there is no active booking, search for the first one in the future
  const firstActiveLab = !availableLab && now && labs.length > 0
    ? labs
        .map(lab => {
          if (!Array.isArray(lab.userBookings)) return null;
          const futureBooking = lab.userBookings
            .filter(b => b.date && b.time && new Date(`${b.date}T${b.time}`) > now)
            .sort((a, b) => new Date(`${a.date}T${a.time}`) 
              - new Date(`${b.date}T${b.time}`))[0];
          return futureBooking ? { lab, booking: futureBooking } : null;
        })
        .filter(Boolean)
        .sort((a, b) => new Date(`${a.booking.date}T${a.booking.time}`) 
          - new Date(`${b.booking.date}T${b.booking.time}`))[0]?.lab
    : null;

  // To show starting and ending times of bookings
  const getBookingTimes = booking => {
    if (!booking?.time || !booking?.minutes) return { start: null, end: null };
    const startDate = new Date(`${booking.date}T${booking.time}`);
    const endDate = new Date(startDate.getTime() + booking.minutes * 60 * 1000);
    return {
      start: booking.time,
      end: `${String(endDate.getHours()).padStart(2, '0')}:
            ${String(endDate.getMinutes()).padStart(2, '0')}`
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

  if (!userData || !now) {
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
  const activeBooking = availableLab && Array.isArray(availableLab.userBookings)
    ? availableLab.userBookings.find(b => isBookingActive([b]))
    : null;

  const nextBooking = !availableLab && firstActiveLab 
                      && Array.isArray(firstActiveLab.userBookings) && now
    ? firstActiveLab.userBookings
        .filter(b => b.date && b.time && new Date(`${b.date}T${b.time}`) > now)
        .sort((a, b) => new Date(`${a.date}T${a.time}`) 
          - new Date(`${b.date}T${b.time}`))[0]
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
              <strong>Name:</strong>{userData.name}
            </p>
            <p className="text-gray-700 break-words">
              <strong>Email:</strong> {userData.email}
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
                              <LabAccess userWallet={user.userid} 
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
                            rounded text-sm bg-yellow-500 hover:bg-yellow-300 text-white'>
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
                  <DatePicker
                    calendarClassName="custom-datepicker"
                    selected={date}
                    onChange={(newDate) => setDate(newDate)}
                    minDate={today}
                    inline
                    dayClassName={day =>
                      bookedDates.some(
                        (d) => d.toDateString() === day.toDateString()
                      )
                        ? "bg-[#9fc6f5] text-white"
                        : undefined
                    }
                    renderDayContents={dayContents}
                  />
                </div>
              </div>
            </div>
            {/* Bottom panel: upcoming and past bookings */}
            <div className="flex min-[1280px]:flex-row flex-col gap-4 mt-6">
              {/* Upcoming booked labs */}
              <div className="min-[1280px]:w-1/2 flex flex-col h-full min-h-[350px]">
                <h2 className="text-2xl font-semibold mb-4 text-center">
                  Upcoming Bookings
                </h2>
                <ul className='w-full flex-1'>
                  {bookingsLoading ? (
                    <DashboardSectionSkeleton title={false} />
                  ) : (
                    now && userData.labs
                    .filter(lab => Array.isArray(lab.userBookings) &&
                      lab.userBookings.some(b => {
                        if (!b.date || !b.time || !b.minutes) return false;
                        const endDateTime = new Date(`${b.date}T${b.time}`);
                        endDateTime.setMinutes(endDateTime.getMinutes() + parseInt(b.minutes));
                        return endDateTime.getTime() > now.getTime();
                      }))
                    .flatMap((lab) => {
                      const upcomingBookings = lab.userBookings.filter(b => {
                        if (!b.date || !b.time || !b.minutes) return false;
                        const endDateTime = new Date(`${b.date}T${b.time}`);
                        endDateTime.setMinutes(endDateTime.getMinutes() + parseInt(b.minutes));
                        return endDateTime.getTime() > now.getTime();
                      })
                      .map(booking => ({
                        ...booking,
                        lab: lab,
                        startDateTime: new Date(`${booking.date}T${booking.time}`)
                      }));

                      return upcomingBookings;
                    })
                    .sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime())
                    .map((booking) => {
                      let startTime = null;
                      let endTime = null;

                      if (booking?.time && booking?.minutes) {
                        const startDateTimeString = `${booking.date}T${booking.time}`;
                        const startDateObj = new Date(startDateTimeString);

                        if (!isNaN(startDateObj.getTime())) {
                          startTime = booking.time;
                          const endTimeMilliseconds = startDateObj.getTime() + parseInt(booking.minutes) * 60 * 1000;
                          const endTimeDate = new Date(endTimeMilliseconds);
                          const endHours = String(endTimeDate.getHours()).padStart(2, '0');
                          const endMinutes = String(endTimeDate.getMinutes()).padStart(2, '0');
                          endTime = `${endHours}:${endMinutes}`;
                        }
                      }

                      return (
                        <LabBookingItem
                          key={`${booking.lab.id}-${booking.reservationKey || booking.date}-${booking.time}`}
                          lab={booking.lab}
                          booking={booking}
                          startTime={startTime}
                          endTime={endTime}
                          onCancel={handleCancellation}
                          isModalOpen={false}
                          closeModal={closeModal}
                        />
                      );
                    }) || []
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
                    now && userData.labs
                    .filter((lab) => Array.isArray(lab.userBookings) &&
                      lab.userBookings.some(b => {
                        if (!b.date || !b.time || !b.minutes) return false;
                        const endDateTime = new Date(`${b.date}T${b.time}`);
                        endDateTime.setMinutes(endDateTime.getMinutes() + parseInt(b.minutes));
                        // Only include past bookings that were confirmed (not PENDING)
                        const hasReservationKey = b.reservationKey;
                        const wasPending = b.status === "0" || b.status === 0;
                        return endDateTime.getTime() <= now.getTime() && hasReservationKey && !wasPending;
                      }))
                    .flatMap((lab) => {
                      const pastBookings = lab.userBookings.filter(b => {
                        if (!b.date || !b.time || !b.minutes) return false;
                        const endDateTime = new Date(`${b.date}T${b.time}`);
                        endDateTime.setMinutes(endDateTime.getMinutes() + parseInt(b.minutes));
                        // Only include past bookings that were confirmed (not PENDING)
                        const hasReservationKey = b.reservationKey;
                        const wasPending = b.status === "0" || b.status === 0;
                        return endDateTime.getTime() <= now.getTime() && hasReservationKey && !wasPending;
                      })
                      .map(booking => ({
                        ...booking,
                        lab: lab,
                        startDateTime: new Date(`${booking.date}T${booking.time}`)
                      }));

                      return pastBookings;
                    })
                    .sort((a, b) => b.startDateTime.getTime() - a.startDateTime.getTime()) // Most recent first
                    .map((booking) => {
                      let startTime = null;
                      let endTime = null;

                      if (booking?.time && booking?.minutes) {
                        const startDateTimeString = `${booking.date}T${booking.time}`;
                        const startDateObj = new Date(startDateTimeString);

                        if (!isNaN(startDateObj.getTime())) {
                          startTime = booking.time;
                          const endTimeMilliseconds = startDateObj.getTime() + parseInt(booking.minutes) * 60 * 1000;
                          const endTimeDate = new Date(endTimeMilliseconds);
                          const endHours = String(endTimeDate.getHours()).padStart(2, '0');
                          const endMinutes = String(endTimeDate.getMinutes()).padStart(2, '0');
                          endTime = `${endHours}:${endMinutes}`;
                        }
                      }

                      return (
                        <LabBookingItem
                          key={`${booking.lab.id}-${booking.reservationKey || booking.date}-${booking.time}`}
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
                    }) || []
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