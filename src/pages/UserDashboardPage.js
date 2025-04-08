import { useAccount } from 'wagmi'
import { useEffect, useState } from 'react'
import { useLabs } from '../context/LabContext'
import Carrousel from '../components/Carrousel';
import LabAccess from "../components/LabAccess";
import React from 'react'

export default function UserDashboard({ auth }) {
  const { address, isConnected } = useAccount()
  const [userData, setUserData] = useState(null)
  const { labs, activeBookings , loading } = useLabs(); // In the future only get user's booked labs
  const [enrichedLabs, setEnrichedLabs] = useState([]);
  const [statusChange, setStatusChange] = useState(false);
  // Get booked labs from LabCard
  const hasActiveBooking = labs.filter((lab) => activeBookings[lab.id]);
  const [firstActiveLab, setFirstActiveLab] = useState(null);

  useEffect(() => {
    if (labs && labs.length > 0) {
      // These new properties should be added to fetchLabsData 
      // or get current/former booking and status info from its actual source
      const newLabs = hasActiveBooking.map(lab => ({
        ...lab,
        activeStatus: false,
        currentlyBooked: false,
        formerlyBooked: false,
      }));
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
      const activeLab = userData.labs.find((lab) => lab.activeStatus === true);
      setFirstActiveLab(activeLab);
    }
  }, [userData?.labs]);

  const setActiveStatus = (labId) => {
    setEnrichedLabs((prevLabs) =>
      prevLabs.map((lab) => {
        if (lab.id === labId) {
          return { ...lab, activeStatus: true };
        }
        return lab;
      })
    );
    setStatusChange((prev) => !prev);
  };

  const setInactiveStatus = (labId) => {
    setEnrichedLabs((prevLabs) =>
      prevLabs.map((lab) => {
        if (lab.id === labId) {
          return { ...lab, 
            formerlyBooked: true,
            activeStatus: false };
        }
        return lab;
      })
    );
    setStatusChange((prev) => !prev);
  };

  if (!userData) {
    return <div className="text-center p-2">Loading user data...</div>
  }

  return (
    <div className="container mx-auto p-4">
      <div className="relative bg-cover bg-center text-white py-5 text-center">
        <h1 className="text-3xl font-bold mb-2">User Dashboard</h1>
      </div>

      <div className="flex flex-row gap-1">
        <div className="bg-white shadow-md rounded-lg p-6 mb-6 w-1/6 h-1/3">
          <h2 className="text-2xl font-semibold mb-4 text-gray-800 text-center">Profile</h2>
          <p className="text-gray-700"><strong>Name:</strong> {userData.name}</p>
          <p className="text-gray-700 break-words"><strong>Email:</strong> {userData.email}</p>
        </div>

        <div className='pl-1 flex-1'>
          <div className='flex flex-row'>
            <div className="bg-white shadow-md rounded-lg p-6 mb-1 mr-1 w-2/3">
              <div className="flex flex-col">
                <h2 className="text-2xl font-semibold mb-2 text-gray-800 text-center">Currently active</h2>
                <hr className='mb-5 separator-width-black'></hr>
                <div className='flex flex-row flex-wrap'>
                  {firstActiveLab && (
                    <React.Fragment key={firstActiveLab.id}>
                      <div className='flex flex-col items-center'>
                        <div key={firstActiveLab.id} className={`w-[250px] group items-center shadow-md bg-gray-200 transform
                            transition-transform duration-300 hover:scale-105 mr-3
                            mb-4 border-2 p-2 h-[250px] rounded-lg flex flex-col ${hasActiveBooking ? 'border-4 border-[#715c8c] animate-glow' : ''}`}
                        >
                          <div className='rounded-lg h-[150px]'>
                            <Carrousel lab={firstActiveLab} maxHeight={140} />
                          </div>
                          <h2 className="text-gray-700 mt-2 block">{firstActiveLab.name}</h2>
                          <span className="text-gray-700 mt-1 block">Available until [date]</span>
                          <LabAccess userWallet={address} hasActiveBooking={hasActiveBooking} auth={firstActiveLab.auth} marginBottom={5} width={300} />
                        </div>
                        <button className='px-3 mr-3 py-1 rounded-full text-sm bg-orange-500 text-white'>Apply for a refund</button>
                      </div>
                      <div className={`w-5/5 flex-1 mb-4 border-2 p-2 text-center rounded-lg shadow-md bg-gray-300`}>
                        <h3 className="text-lg font-semibold mb-2 text-gray-700">Documentation</h3>
                          {firstActiveLab.docs && firstActiveLab.docs.length > 0 && (
                            <div key={0} className="mt-1">
                              <iframe src={firstActiveLab.docs[0]} title="description" height="280px" width="100%" className='rounded-lg'></iframe>
                            </div>
                          )}
                          {firstActiveLab.docs.length === 0 && (
                            <span className="text-gray-700 text-center">No documents available</span>
                          )}
                      </div>
                    </React.Fragment>
                  )}
                  
                </div> 
                {!firstActiveLab && (
                  <span className="text-gray-100 text-center">No lab currently active</span>
                )}
              </div>
            </div>
            {/* UPCOMING BOOKING */}
            <div className="bg-white shadow-md rounded-lg p-6 mb-1 flex-1 w-1/3">
              <div className="flex flex-row gap-4">
                
              </div>
            </div>
          </div>

          <div className="bg-white shadow-md rounded-lg p-6 flex-1">
            <div className="flex flex-row gap-4">
              {/* Booked labs: active and non-active */}
              <div className="w-1/2">
                <h2 className="text-2xl font-semibold mb-2 text-gray-800 text-center">Booked</h2>
                <hr className='mb-5 separator-width-black'></hr>
                <ul>
                  {userData.labs.map((lab) => (
                    <li key={lab.id} className="mb-4">
                      <div className="flex flex-grow items-center">
                        <span className="text-gray-700">{lab.name}</span>
                        {/* Button for lab's activeStatus tests */}
                        {lab.activeStatus ? (
                        <button 
                          className='ml-2 z-50 border text-black rounded-lg p-3 bg-orange-100'
                          onClick={() => setInactiveStatus(lab.id)}>
                          Set Inactive
                        </button>
                        ) : (
                        <button 
                          className='ml-2 z-50 border text-black rounded-lg p-3 bg-orange-100'
                          onClick={() => setActiveStatus(lab.id)}>
                          Set Active
                        </button>
                        )}
                        <span className={`ml-auto px-3 py-1 rounded-full text-sm ${lab.activeStatus === true ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}>
                          {lab.activeStatus === true ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Previously booked labs */}
              <div className="flex-1">
                <h2 className="text-2xl font-semibold mb-2 text-gray-800 text-center">Previously booked</h2>
                <hr className='mb-5 separator-width-black'></hr>
                <ul>
                  {userData.labs
                  .filter((lab) => lab.formerlyBooked === true)
                  .map((lab) => (
                    <li key={lab.id} className="mb-4 border-2 p-2 rounded-lg">
                      <span className="text-gray-700">{lab.name}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}