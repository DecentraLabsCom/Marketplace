import { useEffect, useState } from 'react'
import { useUser } from '../../context/UserContext'
import { useLabs } from '../../context/LabContext'
import Carrousel from '../../components/Carrousel'
import LabAccess from '../../components/LabAccess'
import AccessControl from '../../components/AccessControl'
import Refund from '../../components/Refund'
import React from 'react'
import Link from 'next/link'

export default function UserDashboard() {
  const { isLoggedIn, isConnected, address, user } = useUser();
  const [userData, setUserData] = useState(null)
  const { labs, loading } = useLabs(); // In the future only get user's booked labs
  const [enrichedLabs, setEnrichedLabs] = useState([]);
  const [statusChange, setStatusChange] = useState(false);
  // Get booked labs from LabCard
  const hasActiveBooking = labs.filter(
    (lab) => Array.isArray(lab.bookingInfo) && lab.bookingInfo.some(b => b.activeBooking)
  );
  const [firstActiveLab, setFirstActiveLab] = useState(null);
  const [availableLab, setAvailableLab] = useState(null);
  const [labDate, setLabDate] = useState(null);
  const currentDate = new Date().toISOString().slice(0, 10);
  const [startTime, setStartTime] = useState(null);

  useEffect(() => {
    if (labs && labs.length > 0) {
      const newLabs = labs.map(lab => {
        const bookings = Array.isArray(lab.bookingInfo) ? lab.bookingInfo : [];
        const hasActive = bookings.some(b => b.activeBooking);
        const hasFormerly = bookings.some(
          b =>
            !b.activeBooking &&
            b.date &&
            new Date(b.date) < new Date()
        );
        const activeBooking = bookings.find(b => b.activeBooking);
        // const startTime = activeBooking?.time;
        // console.log("start time: " + startTime);
        return {
          ...lab,
          activeStatus: hasActive,
          currentlyBooked: hasActive,
          formerlyBooked: hasFormerly,
          // startTime: startTime,
        };
      });
      setEnrichedLabs(newLabs);
    }
  }, [labs]);

  useEffect(() => {
    if (isConnected) {
      // Simulate fetching user data (replace with actual API call)
      setTimeout(() => {
        const fetchedUserData = {
          name: "John Doe",
          email: "john.doe@example.com",
          labs: enrichedLabs,
        }
        setUserData(fetchedUserData)
      }, 1500) // Simulate a 1.5-second delay for fetching data
    }
  }, [isConnected, enrichedLabs])

  useEffect(() => {
    if (userData?.labs) {
      const activeLab = userData.labs.find((lab) => {
        if (lab.activeStatus === true && Array.isArray(lab.bookingInfo)) {
          return lab.bookingInfo.some(booking => booking.date !== currentDate);
        }
        return false;
      });
      setFirstActiveLab(activeLab);
  
      if (activeLab && Array.isArray(activeLab.bookingInfo)) {
        const activeBooking = activeLab.bookingInfo.find(b => b.activeBooking);
        if (activeBooking && activeBooking.date) {
          setLabDate(activeBooking.date);
        } else {
          setLabDate(null);
        }
      }
    }
  }, [userData?.labs]);

  // Create useEffect to check for today's availability
  useEffect(() => {
    if (userData?.labs) {
      const availableTodayLab = userData.labs.find((lab) => {
        if (lab.activeStatus === true && Array.isArray(lab.bookingInfo)) {
          console.log("booking info: " + Array.isArray(lab.bookingInfo));
          return lab.bookingInfo.some(booking => booking.date === currentDate);
        }
        return false;
      });
      setAvailableLab(availableTodayLab);
  
      console.log("availableTodayLab:", availableTodayLab)
  
      if (availableTodayLab && Array.isArray(availableTodayLab.bookingInfo)) {
        const activeBooking = availableTodayLab.bookingInfo.find(b => b.activeBooking);
        console.log("activeBooking:", activeBooking);
  
        if (availableTodayLab.activeStatus === true && activeBooking?.time) {
          const startTime = activeBooking.time;
          setStartTime(startTime);
          console.log("Start time: " + startTime);
          console.log("Active booking: " + availableTodayLab.activeStatus);
        } else {
          setStartTime(null);
          console.log("Start time set to null because:");
          console.log("availableTodayLab.activeStatus:", availableTodayLab?.activeStatus);
          console.log("activeBooking?.time:", activeBooking?.time);
        }
      } else {
        setStartTime(null);
        console.log("Start time set to null because availableTodayLab or bookingInfo is missing.");
      }
    }
  }, [userData?.labs]);

  if (!userData) {
    return <div className="text-center p-2">Loading user data...</div>
  }

  return (
    <AccessControl message="Please log in to view and make reservations.">
      <div className="container mx-auto p-4">
        <div className="relative bg-cover bg-center text-white py-5 text-center">
          <h1 className="text-3xl font-bold mb-2">User Dashboard</h1>
        </div>

        <div className="flex flex-row gap-1">
          <div className="bg-white shadow-md rounded-lg p-6 mb-6 w-1/6 h-1/3 hidden">
            <h2 className="text-2xl font-semibold mb-4 text-gray-800 text-center">Profile</h2>
            <p className="text-gray-700"><strong>Name:</strong> {userData.name}</p>
            <p className="text-gray-700 break-words"><strong>Email:</strong> {userData.email}</p>
          </div>

        <div className='pl-1 flex-1'>
          <div className='flex flex-row'>
            <div className="border shadow text-white rounded p-6 mb-1 mr-1 w-2/3">
              <div className="flex flex-col">
                {availableLab ? (
                    <h2 className="text-2xl font-semibold mb-4 text-white text-center">Currently active: {availableLab.name}</h2>
                ) : firstActiveLab && (
                  <h2 className="text-2xl font-semibold mb-4 text-white text-center">Soon to be active: {firstActiveLab.name}</h2>
                )}
                <div className='flex flex-row flex-wrap'>
                  {availableLab ? (
                    <React.Fragment key={availableLab.id}>
                      <div className='flex flex-col items-center'>
                        <div key={availableLab.id} className={`w-[250px] group justify-between items-center shadow-md bg-gray-200 transform
                          transition-transform duration-300 hover:scale-105 mr-3
                          mb-4 border-2 p-2 h-[250px] rounded-lg flex flex-col ${availableLab.activeStatus ? 'border-4 border-[#715c8c] animate-glow' : ''}`}
                        >
                          <div className='rounded-lg h-[150px] w-full'>
                            <Carrousel lab={availableLab} maxHeight={140} />
                          </div>
                          <span className="text-gray-700 block">Available today</span>
                          <div className='text-gray-500 flex flex-col text-sm'>
                            <span>Start time: {startTime}</span>
                            <span>End time:</span>
                          </div>
                          <LabAccess userWallet={address} hasActiveBooking={availableLab.activeStatus} auth={availableLab.auth} />
                        </div>
                      </div>
                      <div className={`w-5/5 ${availableLab.docs.length > 0 ? `` : 'h-[100px]'} flex-1 mb-4 flex flex-col justify-center p-2 text-center rounded-lg shadow-md bg-gray-300`}>
                        {availableLab.docs && availableLab.docs.length > 0 && (
                          <div key={0} className="mt-1">
                            <iframe src={availableLab.docs[0]} title="description" height="260px" width="100%" className='rounded-lg'></iframe>
                          </div>
                        )}
                        {availableLab.docs.length === 0 && (
                          <span className="text-gray-700 text-center">No documents available</span>
                        )}
                        <Link href={`/lab/${availableLab.id}`} className='px-3 mt-3 py-1 rounded
                          text-sm bg-yellow-500 hover:bg-yellow-300 text-white'>Explore this lab</Link>
                      </div>
                    </React.Fragment>
                  ) : firstActiveLab && (
                    <React.Fragment key={firstActiveLab.id}>
                      <div className='flex flex-col items-center'>
                        <div key={firstActiveLab.id} className={`w-[250px] group justify-between items-center shadow-md bg-gray-200 transform
                          transition-transform duration-300 hover:scale-105 mr-3
                          mb-4 border-2 p-2 h-[250px] rounded-lg flex flex-col`}
                        >
                          <div className='rounded-lg h-[150px] w-full'>
                            <Carrousel lab={firstActiveLab} maxHeight={140} />
                          </div>
                          <span className="text-gray-700 block mb-6">Available on: {labDate}</span>
                        </div>
                      </div>
                      <div className={`w-5/5 ${firstActiveLab.docs.length > 0 ? `` : 'h-[100px]'} flex-1 mb-4 flex flex-col justify-center p-2 text-center rounded-lg shadow-md bg-gray-300`}>
                        {firstActiveLab.docs && firstActiveLab.docs.length > 0 && (
                          <div key={0} className="mt-1">
                            <iframe src={firstActiveLab.docs[0]} title="description" height="260px" width="100%" className='rounded-lg'></iframe>
                          </div>
                        )}
                        {firstActiveLab.docs.length === 0 && (
                          <span className="text-gray-700 text-center">No documents available</span>
                        )}
                        <Link href={`/lab/${firstActiveLab.id}`} className='px-3 mt-3 py-1 rounded
                          text-sm bg-yellow-500 hover:bg-yellow-300 text-white'>Explore this lab</Link>
                      </div>
                    </React.Fragment>
                  )}
                  
                </div> 
                {!firstActiveLab && !availableLab && (
                  <span className="text-gray-300 text-center">No upcoming or currently active lab</span>
                )}
              </div>
            </div>
            {/* UPCOMING BOOKING */}
            <div className="border shadow text-white rounded p-6 mb-1 flex-1 w-1/3">
              <div className="flex flex-row gap-4">
                
              </div>
            </div>
          </div>

          <div className="border shadow text-white rounded p-6 flex-1">
            <div className="flex flex-row gap-4">
              {/* Booked labs: active and non-active */}
              <div className="w-1/2 flex items-center justify-center flex-col">
                <h2 className="text-2xl font-semibold mb-4 text-center">Upcoming Booked Labs</h2>
                <ul className='w-4/4'>
                {userData.labs
                  .filter(lab => Array.isArray(lab.bookingInfo) && lab.bookingInfo.some(b => b.activeBooking))
                  .map((lab) => (
                    <div className='mb-4 p-2 rounded-lg text-center'>
                      <li key={lab.id} className="flex flex-col items-center">
                        <div className="border flex items-center w-full">
                          <div className='border flex flex-col w-3/4'>
                            <Link className="border-2 border-white bg-white text-black p-2 px-8 text-center hover:bg-slate-500 flex-grow" href={`/lab/${lab.id}`}>
                              <span className="text-left">{lab.name}</span>
                            </Link>
                            <span>{lab.bookingInfo.find(b => b.activeBooking)?.date}</span>
                          </div>
                          <div className='mx-4'><Refund /></div>
                        </div>
                      </li>
                    </div>
                  ))}
                </ul>
              </div>

                {/* Vertical divider */}  
                <div class="mt-1 mx-3 w-px self-stretch bg-gradient-to-tr
                    from-transparent via-neutral-800 to-transparent opacity-90 dark:via-neutral-200
                    border-l-1 border-neutral-800 dark:border-neutral-200 border-dashed"
                    style={{ borderWidth: '4px', borderLeftStyle: 'dashed' }}>
                </div>
              
                {/* Formerly booked labs */}
                <div className="flex-1">
                  <h2 className="text-2xl  font-semibold mb-4 text-center">Formerly booked</h2>
                  <ul className='flex items-center flex-col justify-center'>
                    {userData.labs
                    .filter((lab) => lab.formerlyBooked === true)
                    .map((lab) => (
                      <Link className="border-2 border-white bg-white text-black mb-4 p-2 px-8 text-center hover:bg-slate-500" href={`/lab/${lab.id}`}>
                        <li key={lab.id} >
                          <span>{lab.name}</span>
                        </li>
                      </Link>
                    ))}
                  </ul>
                </div>
              
            </div>
          </div>
        </div>
      </div>
    </div>
    </AccessControl>
  )
}