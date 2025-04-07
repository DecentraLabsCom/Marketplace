import { useAccount } from 'wagmi'
import { useEffect, useState } from 'react'
import { useLabs } from '../context/LabContext'
import Carrousel from '../components/Carrousel';

export default function UserDashboard() {
  const { address, isConnected } = useAccount()
  const [userData, setUserData] = useState(null)
  const { labs, activeBookings , loading } = useLabs(); // In the future only get user's booked labs
  const [enrichedLabs, setEnrichedLabs] = useState([]);
  const [statusChange, setStatusChange] = useState(false);
  // Get booked labs from LabCard
  const activeLabs = labs.filter((lab) => activeBookings[lab.id]);

  useEffect(() => {
    if (labs && labs.length > 0) {
      // These new properties should be added to fetchLabsData 
      // or get current/former booking and status info from its actual source
      const newLabs = activeLabs.map(lab => ({
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

  if (!userData) {
    return <div className="text-center p-2">Loading user data...</div>
  }

  return (
    <div className="container mx-auto p-4">
      <div className="relative bg-cover bg-center text-white py-5 text-center">
        <h1 className="text-3xl font-bold mb-2">User Dashboard</h1>
      </div>

      <div className="flex flex-row gap-4">
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
            <div className="w-1/2">
              <ul>
                {userData.labs
                .filter((lab) => lab.activeStatus === true)
                .map((lab) => (
                  <li key={lab.id} className="mb-4 border-2 p-2 rounded-lg">
                    <Carrousel lab={lab} containerClassName="h-[100px] mb-[-2px]" imageClassName="h-[80px]"/>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700">{lab.name}</span>
                      {/* Button for lab's activeStatus tests */}
                      
                      <span className={`px-3 py-1 rounded-full text-sm ${lab.activeStatus === true ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}>
                        {lab.activeStatus === true ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            {/* Previously booked labs */}
            <div className="flex-1">
              {/* lab data, available until [date] and documentation links */}
            </div>
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
                      <button 
                        className='ml-2 z-50 border text-black rounded-lg p-3 bg-orange-100'
                        onClick={() => setActiveStatus(lab.id)}>
                        Set Active
                      </button>
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
            </div>
          </div>
        </div>
        </div>


      </div>
    </div>
  )
}