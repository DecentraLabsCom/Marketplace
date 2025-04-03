import { useAccount } from 'wagmi'
import { useEffect, useState } from 'react'

export default function ProviderDashboard() {
  const { address, isConnected } = useAccount()
  const [userData, setUserData] = useState(null)

  useEffect(() => {
    if (isConnected) {
      // Simulate fetching user data (replace with actual API call)
      setTimeout(() => {
        const fetchedUserData = {
          name: "John Doe",
          email: "john.doe@example.com",
          labs: [
            { id: 1, name: "Lab 1", status: "Active" },
            { id: 2, name: "Lab 2", status: "Inactive" },
          ],
        }
        setUserData(fetchedUserData)
      }, 1500) // Simulate a 1.5-second delay for fetching data
    }
  }, [isConnected])

  if (!isConnected) {
    return <div className="text-center p-2">Please connect your wallet to view the lab panel.</div>
  }

  if (!userData) {
    return <div className="text-center p-2">Loading user data...</div>
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-2">Lab Provider Panel</h1>
      <div className="bg-white shadow-md rounded-lg p-6 mb-6">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">Profile</h2>
        <p className="text-gray-700"><strong>Name:</strong> {userData.name}</p>
        <p className="text-gray-700"><strong>Email:</strong> {userData.email}</p>
      </div>
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">Labs</h2>
        <ul>
          {userData.labs.map((lab) => (
            <li key={lab.id} className="mb-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-700">{lab.name}</span>
                <span className={`px-3 py-1 rounded-full text-sm ${lab.status === "Active" ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}>
                  {lab.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}