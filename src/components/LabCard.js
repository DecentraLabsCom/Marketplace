"use client";
import React from "react";
import Link from "next/link";
import LabAccess from "@/components/LabAccess";
import { useUser } from '@/context/UserContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch } from '@fortawesome/free-solid-svg-icons';
import MediaDisplayWithFallback from "@/components/MediaDisplayWithFallback";

const LabCard = React.memo(function LabCard({ id, name, provider, price, auth, activeBooking, image }) {
  const { address, isConnected } = useUser();
 
  return (
    <div className={`relative group rounded-md shadow-md bg-gray-200 
      transition-transform duration-300 hover:scale-105 
      ${activeBooking ? 'border-4 border-[#715c8c] animate-glow' : ''}`} 
      style={{ height: '400px' }}>
      <div className="h-2/3 relative">
        {typeof image === "string" && image.trim() !== "" ? (
          <MediaDisplayWithFallback mediaPath={image} mediaType={'image'} alt={name} fill priority sizes="80vw"
            className="!relative object-cover rounded-t-md" />
        ) : (
          <div className="size-full bg-gray-300 flex items-center justify-center rounded-t-md">
            <span className="text-gray-500">No image</span>
          </div>
        )}
      </div>
      <div className="p-4 h-1/3">
        <h2 className="text-2xl font-bold mt-4 text-[#333f63]">{name}</h2>
        <p className="text-[#3f3363] font-semibold text-sm mt-2">{provider}</p>
        <p className="text-[#335763] font-semibold mt-2">{price} $LAB / hour</p>
      </div>
      <Link href={`/lab/${id}/${provider}`}>
        <div className="absolute inset-0 flex items-center justify-center opacity-0 
          group-hover:opacity-100 transition-opacity duration-300 hover:scale-110 
          text-white text-lg font-bold">
          <FontAwesomeIcon icon={faSearch} className="mr-2" />
          Explore Lab
        </div>
      </Link>
      {isConnected && (
        <LabAccess id={id} userWallet={address} hasActiveBooking={activeBooking} auth={auth} />
      )}
    </div>
  );
});

export default LabCard;