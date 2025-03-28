import Link from "next/link";
import LabAccess from "./LabAccess";
import { useReadContract, useAccount } from 'wagmi';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch } from '@fortawesome/free-solid-svg-icons';
import { useState, useEffect } from 'react';
import { contractABI, contractAddress } from '../contracts/bookings';

export default function LabCard({ id, name, provider, description, price, auth, image }) {
  const { address, isConnected } = useAccount();
  const [hasActiveBooking, setHasActiveBooking] = useState(false);

  const contract = useReadContract({
    address: contractAddress,
    abi: contractABI,
    signerOrProvider: provider,
  });

  useEffect(() => {
    const checkActiveBooking = async () => {
      if (isConnected) {
        try {
          //const booking = await contract.hasActiveBooking(userWallet);
          let booking = Math.random() < 0.5;
          setHasActiveBooking(booking);
        } catch (error) {
          console.log("Error checking active booking:", error);
        }
      } else {
        setHasActiveBooking(false);
      }
    };

    checkActiveBooking();
  }, [address, contract]);
  
  return (
    <div className={`relative group rounded-md shadow-md bg-gray-200 transform 
      transition-transform duration-300 hover:scale-105 
      ${hasActiveBooking ? 'border-4 border-[#715c8c] animate-glow' : ''}`} 
      style={{ height: '400px' }}>
      <div className="h-2/3">
        {/* Only show first image of each lab */}
        <img src={image[0]} alt={name} className="w-full h-full object-cover rounded-t-md" />
      </div>
      <div className="p-4 h-1/3">
        <h2 className="text-2xl font-bold mt-4 text-[#333f63]">{name}</h2>
        <p className="text-[#3f3363] font-semibold text-sm mt-2">{provider}</p>
        <p className="text-[#335763] font-semibold mt-2">{price} $LAB / hour</p>
      </div>
      <Link href={`/lab/${id}`}>
        <div className="absolute inset-0 flex items-center justify-center opacity-0 
          group-hover:opacity-100 transform transition-opacity 
          duration-300 hover:scale-110 text-white text-lg font-bold">
          <FontAwesomeIcon icon={faSearch} className="mr-2" />
          Explore Lab
        </div>
      </Link>
      {isConnected && (
        <LabAccess userWallet={address} hasActiveBooking={hasActiveBooking} auth={auth} />
      )}
    </div>
  );
}