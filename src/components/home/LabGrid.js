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
 * @param {boolean} props.hasMore - Whether another cursor page is available
 * @param {Function} props.onLoadMore - Loads the next cursor page
 * @param {boolean} props.loadingMore - Whether the next page is loading
 * @param {string} props.className - Additional CSS classes
 */
export default function LabGrid({
  labs = [],
  loading = false,
  error = false,
  emptyMessage = "No labs found matching your criteria.",
  className = "",
  hasMore = false,
  onLoadMore = null,
  loadingMore = false,
  catalogueStatus = 'fresh',
  snapshotAt = null,
}) {
  // Prevent hydration mismatch by ensuring consistent initial render
  const [isHydrated, setIsHydrated] = useState(false)
  
  useEffect(() => {
    setIsHydrated(true)
  }, [])
  
  const shouldDeferUntilHydrated = !isHydrated && labs.length === 0

  // Keep skeleton for empty client-first renders, but allow SSR content when labs are already available.
  if (loading || shouldDeferUntilHydrated) {
    return (
      <>
        <span className="sr-only" role="status" aria-live="polite">
          Loading labs...
        </span>
        <LabCardGridSkeleton />
      </>
    )
  }

  // An unavailable catalogue is distinct from a valid catalogue with no labs.
  if (error || labs.length === 0) {
    return (
      <div className="text-center py-12" role={error ? 'alert' : 'status'} aria-live="polite">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 max-w-md mx-auto">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            {error ? 'Catalogue temporarily unavailable' : 'No Labs Found'}
          </h2>
          <p className="text-gray-600">
            {error ? 'Please try again shortly.' : emptyMessage}
          </p>
        </div>
        {!error && hasMore && typeof onLoadMore === 'function' && (
          <LoadMoreButton loadingMore={loadingMore} onLoadMore={onLoadMore} />
        )}
      </div>
    )
  }

  // Lab grid
  return (
    <section>
      {catalogueStatus === 'stale' && (
        <div
          className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
          aria-live="polite"
        >
          Catalogue temporarily unavailable. Showing data last updated at{' '}
          <time dateTime={snapshotAt || undefined}>
            {formatSnapshotTimestamp(snapshotAt)}
          </time>.
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {labs.map((lab, index) => (
          <LabCard
            key={lab.id}
            id={lab.id}
            name={lab.name}
            provider={lab.provider}
            price={lab.price}
            activeBooking={lab.hasActiveBooking}
            activeBookingKey={lab.activeBookingKey}
            isListed={lab.isListed}
            image={lab.image || lab.images?.[0] || lab.imageUrls?.[0]}
            imagePriority={index < 3}
            rating={lab.rating}
            priceUnit={lab.priceUnit}
            resourceType={lab.resourceType}
            demoEnabled={lab.demoEnabled}
          />
        ))}
      </div>
      {hasMore && typeof onLoadMore === 'function' && (
        <LoadMoreButton loadingMore={loadingMore} onLoadMore={onLoadMore} />
      )}
    </section>
  )
}

function formatSnapshotTimestamp(snapshotAt) {
  const timestamp = Date.parse(snapshotAt)
  if (!Number.isFinite(timestamp)) return 'the last valid snapshot'
  return new Date(timestamp).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')
}

function LoadMoreButton({ loadingMore, onLoadMore }) {
  return (
    <div className="mt-8 flex justify-center">
      <button
        type="button"
        onClick={onLoadMore}
        disabled={loadingMore}
        className="rounded-md border border-brand px-5 py-2 text-sm font-medium text-brand hover:bg-brand/10 disabled:cursor-wait disabled:opacity-60"
      >
        {loadingMore ? 'Loading more labs...' : 'Load more labs'}
      </button>
    </div>
  )
}

LabGrid.propTypes = {
  labs: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string.isRequired,
    description: PropTypes.string,
    provider: PropTypes.string,
    category: PropTypes.oneOfType([PropTypes.string, PropTypes.arrayOf(PropTypes.string)]),
    price: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    hasActiveBooking: PropTypes.bool,
    isListed: PropTypes.bool,
    rating: PropTypes.shape({
        score: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        totalEvents: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    }),
    priceUnit: PropTypes.string,
    resourceType: PropTypes.oneOfType([PropTypes.string, PropTypes.number])
  })),
  loading: PropTypes.bool,
  error: PropTypes.bool,
  emptyMessage: PropTypes.string,
  className: PropTypes.string,
  hasMore: PropTypes.bool,
  onLoadMore: PropTypes.func,
  loadingMore: PropTypes.bool,
  catalogueStatus: PropTypes.oneOf(['fresh', 'stale', 'unavailable']),
  snapshotAt: PropTypes.string,
}
