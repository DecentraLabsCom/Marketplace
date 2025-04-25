import React, { useEffect, useState } from 'react'
import DatePicker from "react-datepicker"
import Link from 'next/link'
import { useUser } from '../../context/UserContext'
import { useLabs } from '../../context/LabContext'
import Carrousel from '../../components/Carrousel'
import LabAccess from '../../components/LabAccess'
import AccessControl from '../../components/AccessControl'
import Refund from '../../components/Refund'
import Cancellation from '../../components/Cancellation'
import { isBookingActive } from '../../utils/isBookingActive'

export default function UserDashboard() {
  const { isLoggedIn, isConnected, address } = useUser();
  const { labs, loading } = useLabs();
  const [userData, setUserData] = useState(null);

  const now = new Date();
  const currentDate = now.toISOString().slice(0, 10);

  const availableLab = labs.find(lab => isBookingActive(lab.bookingInfo));

  // Calendar
  const today = new Date();
  const [date, setDate] = useState(new Date());
  const [bookedDates, setBookedDates] = useState([]);
  const renderDayContents = (day, currentDateRender) => {
    const bookingsOnDay = bookedDates.filter(
      (d) => d.toDateString() === currentDateRender.toDateString()
    );

    let title = undefined;

    if (bookingsOnDay.length > 0) {
      title = bookingsOnDay.map(booking => {
        for (const lab of labs) {
          if (Array.isArray(lab.bookingInfo)) {
            const matchingBooking = lab.bookingInfo.find(
              b => new Date(b.date).toDateString() === booking.toDateString()
            );
            if (matchingBooking?.time && matchingBooking?.minutes) {
              const endTimeDate = new Date(new Date(matchingBooking.date + 'T' + matchingBooking.time).getTime() + matchingBooking.minutes * 60 * 1000);
              const endTime = `${String(endTimeDate.getHours()).padStart(2, '0')}:${String(endTimeDate.getMinutes()).padStart(2, '0')}`;
              return `${lab.name}:  ${matchingBooking.time} - ${endTime}`;
            }
          }
        }
        return 'Booked';
      }).join(', ');
    }

    return <div title={title}>{day}</div>;
  };

  useEffect(() => {
    if (labs) {
      const futureBookingDates = labs.reduce((dates, lab) => {
        if (Array.isArray(lab.bookingInfo)) {
          lab.bookingInfo
            .filter(booking => booking.date >= currentDate)
            .forEach(booking => {
              try {
                const dateObject = new Date(booking.date);
                // Verificar si la fecha es válida antes de añadirla
                if (!isNaN(dateObject)) {
                  dates.push(dateObject);
                }
              } catch (error) {
                console.error("Error al convertir fecha:", booking.date, error);
              }
            });
        }
        return dates;
      }, []);
      setBookedDates(futureBookingDates);
      console.log(futureBookingDates);
    }
  }, [labs, currentDate]);

  // If there is no active booking, search for the first one in the future
  const firstActiveLab = !availableLab
    ? labs
        .map(lab => {
          if (!Array.isArray(lab.bookingInfo)) return null;
          const futureBooking = lab.bookingInfo
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
    const [hours, minutes] = booking.time.split(':').map(Number);
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
    if (isConnected) {
      setTimeout(() => {
        setUserData({
          name: "John Doe",
          email: "john.doe@example.com",
          labs: labs,
        });
      }, 1500);
    }
  }, [isConnected, labs]);

  if (!userData) {
    return <div className="text-center p-2">Loading user data...</div>
  }

  // Find active booking or the next one in the future
  const activeBooking = availableLab && Array.isArray(availableLab.bookingInfo)
    ? availableLab.bookingInfo.find(b => isBookingActive([b]))
    : null;

  const nextBooking = !availableLab && firstActiveLab 
                      && Array.isArray(firstActiveLab.bookingInfo)
    ? firstActiveLab.bookingInfo
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

        <div className="flex flex-row gap-1">
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

          <div className='pl-1 flex-1'>
            <div className='flex flex-row'>
              <div className="border shadow text-white rounded p-6 mb-1 mr-1 w-3/4">
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
                  <div className='flex flex-row flex-wrap'>
                    {availableLab ? (
                      <React.Fragment key={availableLab.id}>
                        <div className='flex flex-col items-center'>
                          <div key={availableLab.id} className={`w-[320px] group 
                            justify-between items-center shadow-md bg-gray-200 
                            transform transition-transform duration-300 
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
                              <LabAccess userWallet={address} 
                                      hasActiveBooking={!!activeBooking} 
                                      auth={availableLab.auth} />
                            )}
                          </div>
                        </div>
                        <div className={`w-5/5 ${availableLab.docs.length > 0 ? `` : 
                          'h-[100px]'} flex-1 mb-4 flex flex-col justify-center p-2 
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
                          <div key={firstActiveLab.id} className={`w-[320px] group 
                            justify-between items-center shadow-md bg-gray-200 transform
                            transition-transform duration-300 hover:scale-105 mr-3 mb-4
                            border-2 p-2 h-[320px] rounded-lg flex flex-col`}>
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
                        <div className={`w-5/5 ${firstActiveLab.docs.length > 0 ? `` : 
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
              <div className="border shadow text-white rounded p-6 mb-1 flex-1 w-1/4 flex justify-center 
                items-center">
                <div className="flex flex-row">
                  <DatePicker calendarClassName="custom-datepicker" selected={date} inline minDate={today}
                    onChange={(newDate) => setDate(newDate)} filterDate={() => false}
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
              </div>
            </div>
            {/* Bottom panel: upcoming and past bookings */}
            <div className="flex flex-row gap-4 mt-6">
              {/* Upcoming booked labs */}
              <div className="w-1/2 flex flex-col h-full min-h-[350px]">
                <h2 className="text-2xl font-semibold mb-4 text-center">
                  Upcoming Bookings
                </h2>
                <ul className='w-full flex-1'>
                  {userData.labs
                    .filter(lab => Array.isArray(lab.bookingInfo) && 
                      lab.bookingInfo.some(b => b.date >= currentDate))
                    .sort((a, b) => {
                      const nextBookingA = a.bookingInfo.find(b => b.date >= currentDate);
                      const nextBookingB = b.bookingInfo.find(b => b.date >= currentDate);
                      if (nextBookingA?.date && nextBookingB?.date) {
                        return nextBookingA.date.localeCompare(nextBookingB.date);
                      } else if (nextBookingA?.date) {
                        return -1;
                      } else if (nextBookingB?.date) {
                        return 1;
                      }
                      return 0;
                    })
                    .map((lab) => {
                      const upcomingLab = lab.bookingInfo.find(b => b.date >= currentDate);
                      let startTime = null;
                      let endTime = null;

                      if (upcomingLab?.time && upcomingLab?.minutes) {
                        const startTimeParts = upcomingLab.time.split(':').slice(0, 2).join(':');
                        startTime = startTimeParts;

                        const [hours, minutesPart] = upcomingLab.time.split(':').map(Number);
                        const startDate = new Date();
                        startDate.setHours(hours);
                        startDate.setMinutes(minutesPart);
                        startDate.setSeconds(0);

                        const endTimeMilliseconds = startDate.getTime() 
                          + upcomingLab.minutes * 60 * 1000;
                        const endTimeDate = new Date(endTimeMilliseconds);
                        const endHours = String(endTimeDate.getHours()).padStart(2, '0');
                        const endMinutes = String(endTimeDate.getMinutes()).padStart(2, '0');
                        endTime = `${endHours}:${endMinutes}`;
                      }

                      return (
                        <div className='mb-4 p-2 rounded-lg text-center' key={lab.id}>
                          <li className="flex flex-col items-center">
                            <div className="border flex items-center w-full">
                              <div className='border flex flex-col w-3/4'>
                                <Link className="border-2 border-white bg-white p-2 px-8 
                                    text-black text-center hover:bg-slate-500 flex-grow" 
                                  href={`/lab/${lab.id}`}>
                                  <span className="text-left">
                                    {lab.name}
                                  </span>
                                </Link>
                                <span>Available: {upcomingLab?.date}</span>
                                <div className='text-gray-500 flex flex-col text-xs mb-1'>
                                  <span>Start time: {startTime}</span>
                                  <span>End time: {endTime}</span>
                                </div>
                              </div>
                              {lab.isAccessible ? (
                                <div className='px-3 mx-4 py-1 rounded text-sm bg-gray-500
                                text-white'> Can't be cancelled</div>
                              ) : (
                                <div className='mx-4'><Cancellation /></div>
                              )}
                            </div>
                          </li>
                        </div>
                      );
                    })}
                </ul>
              </div>
              {/* Vertical divider */}
              <div className="mt-1 mx-3 w-px self-stretch bg-gradient-to-tr 
                from-transparent via-neutral-800 to-transparent opacity-90 
                dark:via-neutral-200 border-l-1 border-neutral-800 
                dark:border-neutral-200 border-dashed"
                style={{ borderWidth: '4px', borderLeftStyle: 'dashed' }} />
              {/* Past booked labs */}
              <div className="w-1/2 flex flex-col h-full min-h-[350px]">
                <h2 className="text-2xl font-semibold mb-4 text-center">
                  Past bookings
                </h2>
                <ul className='w-full flex-1'>
                  {userData.labs
                    .filter((lab) => Array.isArray(lab.bookingInfo) && 
                      lab.bookingInfo.some(b => b.date < currentDate))
                    .sort((a, b) => {
                      // Order from more recent to older
                      const lastBookingA = a.bookingInfo
                        .filter(b => b.date < currentDate)
                        .sort((x, y) => new Date(y.date) - new Date(x.date))[0];

                      const lastBookingB = b.bookingInfo
                        .filter(b => b.date < currentDate)
                        .sort((x, y) => new Date(y.date) - new Date(x.date))[0];

                      if (lastBookingA?.date && lastBookingB?.date) {
                        return new Date(lastBookingB.date) - new Date(lastBookingA.date);
                      } else if (lastBookingA?.date) {
                        return -1;
                      } else if (lastBookingB?.date) {
                        return 1;
                      }
                      return 0;
                    })
                    .map((lab) => {
                      const notActive = lab.bookingInfo.find(b => b.date < currentDate);
                      let startTime = null;
                      let endTime = null;

                      if (notActive?.time && notActive?.minutes) {
                        const startTimeParts = notActive.time.split(':').slice(0, 2).join(':');
                        startTime = startTimeParts;

                        const [hours, minutesPart] = notActive.time.split(':').map(Number);
                        const startDate = new Date();
                        startDate.setHours(hours);
                        startDate.setMinutes(minutesPart);
                        startDate.setSeconds(0);

                        const endTimeMilliseconds = startDate.getTime() + 
                          notActive.minutes * 60 * 1000;
                        const endTimeDate = new Date(endTimeMilliseconds);
                        const endHours = String(endTimeDate.getHours()).padStart(2, '0');
                        const endMinutes = String(endTimeDate.getMinutes()).padStart(2, '0');
                        endTime = `${endHours}:${endMinutes}`;
                      }

                      return (
                        <div className='mb-4 p-2 rounded-lg text-center' key={lab.id}>
                          <li className="flex flex-col items-center">
                            <div className="border flex items-center w-full">
                              <div className='border flex flex-col w-3/4'>
                                  <Link className="border-2 border-white bg-white p-2 px-8  
                                    text-black text-center hover:bg-slate-500 flex-grow" 
                                    href={`/lab/${lab.id}`}>
                                    <span className="text-left">
                                      {lab.name}
                                    </span>
                                  </Link>
                                <span className='text-center'>{notActive?.date}</span>
                                <div className='text-gray-500 flex flex-col text-xs mb-1 
                                  text-center'>
                                  <span>Start time: {startTime}</span>
                                  <span>End time: {endTime}</span>
                                </div>
                              </div>
                              <div className='mx-4'><Refund /></div>
                            </div>
                          </li>
                        </div>
                      );
                  })}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AccessControl>
  )
}