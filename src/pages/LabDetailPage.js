import { useAccount, useContractWrite } from 'wagmi'
import { useState, useEffect } from 'react'
import { fetchLabsData, subscribeToLabs, getLabs } from "../utils/fetchLabsData";
import Carrousel from '@/components/Carrousel'

export default function LabDetailPage({ id }) {
  const { isConnected } = useAccount();
  const [lab, setLab] = useState(null);

  useEffect(() => {
    fetchLabsData(); // Trigger data fetching

    const unsubscribe = subscribeToLabs((updatedLabs) => {
      const currentLab = updatedLabs.find((lab) => lab.id == id);
      setLab(currentLab);
    });

    return () => unsubscribe(); // Cleanup subscription on unmount
  }, [id]);

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
        className="bg-green-600 text-white px-4 py-2 rounded mt-3 w-full disabled:opacity-50"
      >
      "Rent Lab"
      </button>
    </div>
  )
}
