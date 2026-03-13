import PropTypes from 'prop-types'
import { Skeleton, SkeletonCard, SkeletonText, SkeletonImage, SkeletonButton } from './Skeleton'

/**
 * Lab card skeleton placeholder
 * Displays a loading skeleton matching the lab card layout
 * @returns {JSX.Element} Lab card skeleton with image, title, tags, description, provider, and action button
 */
export function LabCardSkeleton(props) {
  return (
    <SkeletonCard className="overflow-hidden" data-testid="lab-card-skeleton" {...props}>
      {/* Image skeleton */}
      <SkeletonImage aspectRatio="aspect-video" aria-hidden="true" role="img" />
      {/* Content */}
      <div className="space-y-3">
        {/* Title */}
        <Skeleton width="w-3/4" height="h-6" data-testid="skeleton" />
        {/* Category/Keywords */}
        <div className="flex gap-2">
          <Skeleton width="w-16" height="h-5" rounded="rounded-full" data-testid="skeleton" />
          <Skeleton width="w-20" height="h-5" rounded="rounded-full" data-testid="skeleton" />
        </div>
        {/* Description */}
        <SkeletonText lines={2} data-testid="skeleton-text" />
        {/* Provider */}
        <div className="flex items-center gap-2">
          <Skeleton width="w-6" height="h-6" rounded="rounded-full" data-testid="skeleton" />
          <Skeleton width="w-32" height="h-4" data-testid="skeleton" />
        </div>
        {/* Price and button */}
        <div className="flex justify-between items-center">
          <Skeleton width="w-20" height="h-6" data-testid="skeleton" />
          <SkeletonButton data-testid="skeleton-button" />
        </div>
      </div>
    </SkeletonCard>
  );
}

/**
 * Grid of lab card skeletons
 * Displays multiple lab card skeletons in a responsive grid layout
 * @param {Object} props - Component props
 * @param {number} [props.count=6] - Number of skeleton cards to display
 * @returns {JSX.Element} Grid of lab card skeletons
 */
export function LabCardGridSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <LabCardSkeleton key={i} />
      ))}
    </div>
  );
}

// PropTypes
LabCardGridSkeleton.propTypes = {
  count: PropTypes.number
}
