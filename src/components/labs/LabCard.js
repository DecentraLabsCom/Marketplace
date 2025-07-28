"use client";
import React from 'react'
import PropTypes from 'prop-types'
import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSearch } from '@fortawesome/free-solid-svg-icons'
import { useUser } from '@/context/UserContext'
import { useLabToken } from '@/hooks/useLabToken'
import LabAccess from '@/components/labs/LabAccess'
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
      className={cn(
        'relative group h-[400px] transition-transform duration-300 hover:scale-105',
        {
          'ring-4 ring-primary-500 ring-opacity-50': activeBooking
        }
      )}
      padding="none"
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
            className="!relative object-cover rounded-t-lg" 
          />
        ) : (
          <div className="size-full bg-gray-100 flex items-center justify-center rounded-t-lg">
            <span className="text-gray-400">No image</span>
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
      <div className="p-spacing-md h-1/3 flex flex-col justify-between">
        <div>
          <h2 className="text-lg xl:text-xl font-semibold text-gray-900 mb-1">
            {name}
          </h2>
          <p className="text-sm text-gray-600 mb-2">
            {provider}
          </p>
          <p className="text-sm font-medium text-primary-600">
            {formatPrice(price)} $LAB / hour
          </p>
        </div>
      </div>

      {/* Hover Overlay */}
      <Link href={`/lab/${id}/${provider}`}>
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center 
          opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-lg">
          <div className="text-white text-lg font-medium flex items-center">
            <FontAwesomeIcon icon={faSearch} className="mr-2" />
            Explore Lab
          </div>
        </div>
      </Link>

      {/* Lab Access Component */}
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
