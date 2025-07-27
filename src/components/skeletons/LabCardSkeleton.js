import { Skeleton, SkeletonCard, SkeletonText, SkeletonImage, SkeletonButton } from './Skeleton'

export function LabCardSkeleton() {
  return (
    <SkeletonCard className="overflow-hidden">
      {/* Image skeleton */}
      <SkeletonImage aspectRatio="aspect-video" />
      
      {/* Content */}
      <div className="space-y-3">
        {/* Title */}
        <Skeleton width="w-3/4" height="h-6" />
        
        {/* Category/Keywords */}
        <div className="flex gap-2">
          <Skeleton width="w-16" height="h-5" rounded="rounded-full" />
          <Skeleton width="w-20" height="h-5" rounded="rounded-full" />
        </div>
        
        {/* Description */}
        <SkeletonText lines={2} />
        
        {/* Provider */}
        <div className="flex items-center gap-2">
          <Skeleton width="w-6" height="h-6" rounded="rounded-full" />
          <Skeleton width="w-32" height="h-4" />
        </div>
        
        {/* Price and button */}
        <div className="flex justify-between items-center">
          <Skeleton width="w-20" height="h-6" />
          <SkeletonButton />
        </div>
      </div>
    </SkeletonCard>
  );
}

// Grid of lab cards
export function LabCardGridSkeleton({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <LabCardSkeleton key={i} />
      ))}
    </div>
  );
}
