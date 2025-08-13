/**
 * Lab grid display component
 * Renders a responsive grid of lab cards with loading states
 */
import React, { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import LabCard from '@/components/home/LabCard'
import { LabCardGridSkeleton } from '@/components/skeletons'

/**
 * Grid component for displaying lab cards
 * @param {Object} props
 * @param {Array} props.labs - Array of lab objects to display
 * @param {boolean} props.loading - Loading state
 * @param {boolean} props.error - Error state
 * @param {string} props.emptyMessage - Message to show when no labs found
 * @param {string} props.className - Additional CSS classes
 */
export default function LabGrid({
  labs = [],
  loading = false,
  error = false,
  emptyMessage = "No labs found matching your criteria.",
  className = ""
}) {
  // Prevent hydration mismatch by ensuring consistent initial render
  const [isHydrated, setIsHydrated] = useState(false)
  
  useEffect(() => {
    setIsHydrated(true)
  }, [])
  
  // During SSR and initial hydration, always show loading to prevent mismatch
  if (!isHydrated || loading) {
    return <LabCardGridSkeleton />
  }

  // Error state
  if (error) {
    return (
      <div className="text-center py-12">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md mx-auto">
          <h3 className="text-lg font-semibold text-red-800 mb-2">
            Unable to Load Labs
          </h3>
          <p className="text-red-600">
            There was an error loading the laboratory data. Please try refreshing the page.
          </p>
        </div>
      </div>
    )
  }

  // Empty state
  if (labs.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 max-w-md mx-auto">
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
            No Labs Found
          </h3>
          <p className="text-gray-600">
            {emptyMessage}
          </p>
        </div>
      </div>
    )
  }

  // Lab grid
  return (
    <section>
      <div className="grid grid-cols-1 sm:grid-cols-2 min-[1024px]:grid-cols-3 gap-6">
        {labs.map((lab) => (
          <LabCard
            key={lab.id}
            id={lab.id}
            name={lab.name}
            provider={lab.provider}
            price={lab.price}
            auth={lab.auth}
            activeBooking={lab.hasActiveBooking}
            image={lab.images?.[0]}
          />
        ))}
      </div>
    </section>
  )
}

LabGrid.propTypes = {
  labs: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string.isRequired,
    description: PropTypes.string,
    provider: PropTypes.string,
    category: PropTypes.string,
    price: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    keywords: PropTypes.string,
    imageUrls: PropTypes.arrayOf(PropTypes.string),
    uri: PropTypes.string,
    hasActiveBooking: PropTypes.bool
  })),
  loading: PropTypes.bool,
  error: PropTypes.bool,
  emptyMessage: PropTypes.string,
  className: PropTypes.string
}
