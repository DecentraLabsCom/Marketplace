import { Skeleton, SkeletonCard } from './Skeleton';

export function CalendarSkeleton() {
  return (
    <SkeletonCard className="flex justify-center items-center h-80">
      <div className="space-y-3 w-full max-w-xs">
        {/* Calendar header */}
        <div className="flex justify-between items-center mb-4">
          <Skeleton width="w-6" height="h-6" />
          <Skeleton width="w-32" height="h-6" />
          <Skeleton width="w-6" height="h-6" />
        </div>
        
        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Weekday headers */}
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={`header-${i}`} width="w-8" height="h-6" />
          ))}
          
          {/* Calendar days */}
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton 
              key={`day-${i}`} 
              width="w-8" 
              height="h-8" 
              rounded="rounded-full"
            />
          ))}
        </div>
      </div>
    </SkeletonCard>
  );
}

// Lab detail hero section skeleton
export function LabHeroSkeleton() {
  return (
    <SkeletonCard className="flex md:flex-row flex-col gap-4 p-6">
      {/* Left side - Lab info */}
      <div className="flex-1 space-y-4">
        {/* Title */}
        <Skeleton width="w-3/4" height="h-8" />
        
        {/* Provider */}
        <div className="flex items-center gap-2">
          <Skeleton width="w-5" height="h-5" rounded="rounded-full" />
          <Skeleton width="w-40" height="h-5" />
        </div>
        
        {/* Description */}
        <div className="space-y-2">
          <Skeleton width="w-full" height="h-4" />
          <Skeleton width="w-5/6" height="h-4" />
          <Skeleton width="w-4/5" height="h-4" />
        </div>
        
        {/* Tags */}
        <div className="flex gap-2 flex-wrap">
          <Skeleton width="w-16" height="h-6" rounded="rounded-full" />
          <Skeleton width="w-20" height="h-6" rounded="rounded-full" />
          <Skeleton width="w-18" height="h-6" rounded="rounded-full" />
        </div>
      </div>
      
      {/* Right side - Image carousel */}
      <div className="md:w-80 w-full">
        <Skeleton width="w-full" height="h-64" rounded="rounded-lg" />
      </div>
    </SkeletonCard>
  );
}
