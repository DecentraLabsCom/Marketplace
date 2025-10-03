import PropTypes from 'prop-types'
import { Skeleton, SkeletonCard, SkeletonButton } from './Skeleton'

/**
 * Booking item skeleton placeholder
 * Displays a loading skeleton matching the booking item layout
 * @returns {JSX.Element} Booking item skeleton with lab image, details, status badge, and action button
 */
export function BookingItemSkeleton() {
  return (
    <SkeletonCard className="flex items-center justify-between p-4">
      {/* Left side - Lab info */}
      <div className="flex items-center gap-4 flex-1">
        {/* Lab image */}
        <Skeleton width="w-16" height="h-16" rounded="rounded-lg" />
        
        {/* Lab details */}
        <div className="space-y-2 flex-1">
          {/* Lab name */}
          <Skeleton width="w-48" height="h-5" />
          
          {/* Date and time */}
          <div className="flex gap-4">
            <Skeleton width="w-24" height="h-4" />
            <Skeleton width="w-20" height="h-4" />
          </div>
          
          {/* Provider */}
          <Skeleton width="w-32" height="h-4" />
        </div>
      </div>
      
      {/* Right side - Status and actions */}
      <div className="flex items-center gap-3">
        {/* Status badge */}
        <Skeleton width="w-20" height="h-6" rounded="rounded-full" />
        
        {/* Action button */}
        <SkeletonButton />
      </div>
    </SkeletonCard>
  );
}

/**
 * List of booking item skeletons
 * Displays multiple booking item skeletons stacked vertically
 * @param {Object} props - Component props
 * @param {number} [props.count=3] - Number of skeleton items to display
 * @returns {JSX.Element} Vertical list of booking item skeletons
 */
export function BookingListSkeleton({ count = 3 }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <BookingItemSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Dashboard section skeleton
 * Displays a complete dashboard section skeleton with optional title and booking list
 * @param {Object} props - Component props
 * @param {boolean} [props.title=true] - Whether to show the title skeleton
 * @returns {JSX.Element} Dashboard section skeleton with title and booking list
 */
export function DashboardSectionSkeleton({ title = true }) {
  return (
    <div className="space-y-4">
      {title && (
        <Skeleton width="w-48" height="h-7" />
      )}
      <BookingListSkeleton count={2} />
    </div>
  );
}

// PropTypes
BookingListSkeleton.propTypes = {
  count: PropTypes.number
}

DashboardSectionSkeleton.propTypes = {
  title: PropTypes.bool
}
