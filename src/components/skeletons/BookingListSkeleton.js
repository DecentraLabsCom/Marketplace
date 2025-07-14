import { Skeleton, SkeletonCard, SkeletonButton } from './Skeleton';

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

export function BookingListSkeleton({ count = 3 }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <BookingItemSkeleton key={i} />
      ))}
    </div>
  );
}

// Dashboard section skeleton
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
