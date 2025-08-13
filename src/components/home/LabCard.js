"use client";
import React from 'react'
import PropTypes from 'prop-types'
import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSearch } from '@fortawesome/free-solid-svg-icons'
import { useUser } from '@/context/UserContext'
import { useLabToken } from '@/context/LabTokenContext'
import LabAccess from '@/components/home/LabAccess'
import MediaDisplayWithFallback from '@/components/ui/media/MediaDisplayWithFallback'
import { Card, Badge, cn } from '@/components/ui'

/**
 * Individual lab card component for displaying lab information in grid/list views
 * Shows lab preview with image, pricing, and booking status
 * @param {Object} props
 * @param {string|number} props.id - Unique lab identifier
 * @param {string} props.name - Lab name/title
 * @param {string} props.provider - Lab provider address
 * @param {string|number} props.price - Lab price per hour
 * @param {string} props.auth - Authentication requirements
 * @param {boolean} props.activeBooking - Whether user has active booking
 * @param {string} props.image - Lab main image URL
 * @returns {JSX.Element} Lab card with image, details, and action buttons
 */
const LabCard = React.memo(function LabCard({ id, name, provider, price, auth, activeBooking, image }) {
  const { address, isConnected } = useUser();
  const { formatPrice } = useLabToken();
 
  return (
    <Card 
      padding="none"
      className={cn(
        'relative group h-[400px] transition-transform duration-300 hover:scale-105',
        {
          'border-4 border-brand animate-glow': activeBooking
        }
      )}
    >
      {/* Lab Image */}
      <div className="h-2/3 relative">
        {typeof image === "string" && image.trim() !== "" ? (
          <MediaDisplayWithFallback 
            mediaPath={image} 
            mediaType={'image'} 
            alt={name} 
            fill 
            priority 
            sizes="80vw"
            className="!relative object-cover rounded-t-md" 
          />
        ) : (
          <div className="size-full bg-gray-300 flex items-center justify-center rounded-t-md">
            <span className="text-gray-500">No image</span>
          </div>
        )}
        
        {/* Active Booking Badge */}
        {activeBooking && (
          <div className="absolute top-2 right-2">
            <Badge variant="success" size="sm">Active</Badge>
          </div>
        )}
      </div>

      {/* Lab Details */}
      <div className="p-4 h-1/3">
        <h2 className="text-xl min-[700px]:text-2xl font-bold min-[768px]:mt-2 text-[#333f63]">{name}</h2>
        <div className="md:flex md:justify-between md:items-center min-[700px]:block min-[768px]:mt-4">
          <p className="text-[#3f3363] font-semibold text-base mt-2">{provider}</p>
          <p className="text-[#335763] font-semibold mt-2 md:mt-2">{formatPrice(price)} $LAB / hour</p> 
        </div>
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
    </Card>
  );
});

LabCard.propTypes = {
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  name: PropTypes.string.isRequired,
  provider: PropTypes.string.isRequired,
  price: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  auth: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]),
  activeBooking: PropTypes.bool,
  image: PropTypes.string
}

LabCard.defaultProps = {
  auth: null,
  activeBooking: false,
  image: ''
}

export default LabCard;
