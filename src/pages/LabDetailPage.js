import { useAccount, useContractWrite } from 'wagmi'
import { useState, useEffect } from 'react'
import { labs } from '../utils/labsdata'
import Carrousel from '@/components/Carrousel'

export default function LabDetailPage({ id }) {
  const { isConnected } = useAccount()
  const [isLoading, setIsLoading] = useState(false)
  const [lab, setLab] = useState(null)

  useEffect(() => {
    if (id) {
      // Simulate fetching lab data (replace with actual API call)
      setTimeout(() => {
        const currentLab = labs.find((lab) => lab.id == id)
        setLab(currentLab)
      }, 1500) // Simulate a 1.5-second delay for fetching data
    }
  }, [id])

  const { write: rentLab } = useContractWrite({
    address: "YOUR_SMART_CONTRACT_ADDRESS",
    abi: [
      {
        inputs: [{ internalType: "uint256", name: "labId", type: "uint256" }],
        name: "rentLab",
        outputs: [],
        stateMutability: "payable",
        type: "function",
      },
    ],
    functionName: "rentLab",
  })

  const handleRent = () => {
    if (!isConnected) {
      alert("Please connect your wallet first.")
      return
    }
    setIsLoading(true)
    rentLab({ args: [id], value: lab.price })
  }

  if (!lab) {
    return <div className="text-center">Loading lab details...</div>
  }

  return (
    <div className="container mx-auto p-10">
      <Carrousel lab={lab} />
      <h2 className="text-lg font-bold mt-2">{lab.name}</h2>
      <p className="text-gray-400 text-sm text-justify">{lab.description}</p>
      <p className="text-blue-600 font-semibold mt-2">{lab.price} ETH</p>
      <button
        onClick={handleRent}
        disabled={isLoading}
        className="bg-green-600 text-white px-4 py-2 rounded mt-3 w-full disabled:opacity-50"
      >
        {isLoading ? "Renting..." : "Rent Lab"}
      </button>
    </div>
  )
}
