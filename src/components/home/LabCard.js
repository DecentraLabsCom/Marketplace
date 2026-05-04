"use client";
import React, { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import PropTypes from 'prop-types'
import Link from 'next/link'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSearch, faStar } from '@fortawesome/free-solid-svg-icons'
import { useUser } from '@/context/UserContext'
import { useLabCredit } from '@/context/LabCreditContext'
import { Card, cn, LabCardImage } from '@/components/ui'
import { getLabAgeLabel, getLabRatingValue } from '@/utils/labStats'
import { RESOURCE_TYPES, getResourceType } from '@/utils/resourceType'

const LabAccess = dynamic(() => import('@/components/home/LabAccess'), { ssr: false });

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
 * @param {boolean} [props.isListed=true] - Whether the lab is currently listed
 * @param {string} props.image - Lab main image URL
 * @param {Object} props.reputation - Lab reputation stats
 * @param {string|number} props.createdAt - Lab creation timestamp (seconds)
 * @returns {JSX.Element} Lab card with image, details, and action buttons
 */
const LabCard = React.memo(function LabCard({
  id,
  name,
  provider,
  price,
  auth = null,
  activeBooking = false,
  activeBookingKey = null,
  isListed = true,
  image = '',
  imagePriority = false,
  reputation = null,
  createdAt = null,
  resourceType = RESOURCE_TYPES.LAB
}) {
  const isFmu = getResourceType({ resourceType }) === RESOURCE_TYPES.FMU;
  const { isSSO } = useUser();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const { formatPrice } = useLabCredit();
  const ratingValue = getLabRatingValue(reputation);
  const ratingLabel = ratingValue !== null ? ratingValue.toFixed(1) : null;
  const ageLabel = getLabAgeLabel(createdAt);
  const statsLabel = [ratingLabel ? `Rating ${ratingLabel}/5` : null, ageLabel ? `Age ${ageLabel}` : null]
    .filter(Boolean)
    .join(' | ');
  
  const reservationKey = isSSO && activeBooking ? (activeBookingKey || null) : null;
 
  return (
    <Card 
      padding="none"
      className={cn(
        // Base card + hover and enter animation
        'relative group h-100 transition-transform duration-300 hover:scale-105 starting:opacity-0 starting:translate-y-2 opacity-100 translate-y-0',
        {
          'border-4 border-brand animate-glow': activeBooking
        }
      )}
    >
      {/* Lab Image with React Query Caching */}
      <div className="h-2/3 relative overflow-hidden rounded-t-md">
        {typeof image === "string" && image.trim() !== "" ? (
          <LabCardImage 
            src={image}
            alt={name}
            labId={id}
            priority={imagePriority}
          />
        ) : (
          <LabCardImage 
            src={'/labs/lab_placeholder.png'}
            alt={name}
            labId={id}
            priority={imagePriority}
          />
        )}
        
        {/* Active Booking Badge */}
        {/*{activeBooking && (
          <div className="absolute top-0 right-0 text-brand border-l-2 border-brand px-3 py-2 rounded-bl-lg shadow-lg backdrop-blur-sm">
            <span className="text-xs font-semibold uppercase tracking-wide">
              Active
            </span>
          </div>
        )}*/}
        
        {/* Rating + Age Badge */}
        {(ratingLabel || ageLabel) && (
          <div
            className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-sm"
            title={statsLabel || undefined}
          >
            {ratingLabel && (
              <span className="inline-flex items-center gap-1">
                <FontAwesomeIcon icon={faStar} className="text-brand text-[0.7rem]" />
                <span>{ratingLabel}</span>
              </span>
            )}
            {ratingLabel && ageLabel && <span className="text-white/60">|</span>}
            {ageLabel && <span>{ageLabel}</span>}
          </div>
        )}

        {/* Unlisted Badge */}
        {!isListed && (
          <div className={`absolute top-0 ${activeBooking ? 'right-16' : 'right-0'} bg-[#1f2426] text-brand border-l-2 border-brand px-3 py-2 rounded-bl-lg shadow-lg backdrop-blur-sm`}>
            <span className="text-xs font-semibold uppercase tracking-wide">
              Unlisted
            </span>
          </div>
        )}
      </div>

      {/* Lab Details */}
      <div className="p-4 h-1/3">
        <div className="flex items-start justify-between gap-2 md:mt-2">
          <h2 className="text-xl min-[700px]:text-2xl font-bold text-hover-dark">{name}</h2>
          {isFmu ? (
            <span className="shrink-0 rounded-full bg-hover-dark/90 px-2.5 py-1 text-xs font-semibold text-white shadow-sm">
              Sim
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-header-bg/90 px-2.5 py-1 text-xs font-semibold text-hover-dark shadow-sm">
              Real
            </span>
          )}
        </div>
        <div className="md:flex md:justify-between md:items-center min-[700px]:block md:mt-4">
          <p className="text-ui-label-dark font-semibold text-base mt-2">{provider}</p>
          <p className="text-text-secondary font-semibold mt-2 md:mt-2">{formatPrice(price)} credits / hour</p> 
        </div>
      </div>

      <Link href={`/lab/${id}`}>
        <div className="absolute inset-0 flex items-center justify-center opacity-0
          group-hover:opacity-100 transition-opacity duration-300 hover:scale-110
          text-white text-lg font-bold">
          <FontAwesomeIcon icon={faSearch} className="mr-2" />
          {isFmu ? 'Explore Simulation' : 'Explore Lab'}
        </div>
      </Link>
      {isClient && isSSO && (
        <LabAccess 
          id={id} 
          hasActiveBooking={activeBooking} 
          reservationKey={reservationKey}
        />
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
  activeBookingKey: PropTypes.string,
  isListed: PropTypes.bool,
  image: PropTypes.string,
  imagePriority: PropTypes.bool,
  reputation: PropTypes.shape({
    score: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    totalEvents: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    ownerCancellations: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    institutionalCancellations: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    lastUpdated: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
  }),
  createdAt: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  resourceType: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
}

export default LabCard;

