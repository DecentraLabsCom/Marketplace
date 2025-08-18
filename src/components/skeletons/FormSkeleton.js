import PropTypes from 'prop-types'
import { Skeleton, SkeletonCard } from './Skeleton'

export function FormSkeleton() {
  return (
    <SkeletonCard className="space-y-6 p-6">
      {/* Form header */}
      <div className="text-center space-y-2">
        <Skeleton width="w-48" height="h-8" className="mx-auto" />
        <Skeleton width="w-64" height="h-4" className="mx-auto" />
      </div>
      
      {/* Form fields */}
      <div className="space-y-4">
        {/* Date selector */}
        <div className="space-y-2">
          <Skeleton width="w-20" height="h-4" />
          <div className="flex justify-center">
            <Skeleton width="w-64" height="h-64" rounded="rounded-lg" />
          </div>
        </div>
        
        {/* Time fields */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton width="w-24" height="h-4" />
            <Skeleton width="w-full" height="h-10" rounded="rounded-md" />
          </div>
          <div className="space-y-2">
            <Skeleton width="w-28" height="h-4" />
            <Skeleton width="w-full" height="h-10" rounded="rounded-md" />
          </div>
        </div>
        
        {/* Submit button */}
        <div className="flex justify-center pt-4">
          <Skeleton width="w-32" height="h-10" rounded="rounded-md" />
        </div>
      </div>
    </SkeletonCard>
  );
}

// Loading overlay for buttons
export function ButtonLoadingSkeleton({ children, isLoading = false }) {
  if (isLoading) {
    return (
      <div className="relative">
        {children}
        <div className="absolute inset-0 bg-gray-900/50 rounded flex items-center justify-center">
          <div className="animate-spin rounded-full size-4 border-b-2 border-white"></div>
        </div>
      </div>
    );
  }
  return children;
}

// PropTypes
ButtonLoadingSkeleton.propTypes = {
  children: PropTypes.node.isRequired,
  isLoading: PropTypes.bool
}
