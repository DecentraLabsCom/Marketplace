import PropTypes from 'prop-types'

// Base skeleton component with consistent styling
export function Skeleton({ className = "", width = "w-full", height = "h-4", rounded = "rounded" }) {
  return (
    <div 
      className={`animate-pulse bg-gray-200 dark:bg-gray-700 ${width} ${height} ${rounded} ${className}`}
    />
  );
}

// Card skeleton wrapper
export function SkeletonCard({ children, className = "" }) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 space-y-3 ${className}`}>
      {children}
    </div>
  );
}

// Text skeleton with different sizes
export function SkeletonText({ lines = 1, className = "" }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton 
          key={i}
          width={i === lines - 1 ? "w-3/4" : "w-full"}
          height="h-4"
        />
      ))}
    </div>
  );
}

// Image skeleton
export function SkeletonImage({ aspectRatio = "aspect-video", className = "" }) {
  return (
    <Skeleton 
      className={`${aspectRatio} ${className}`}
      width="w-full"
      height="h-auto"
      rounded="rounded-lg"
    />
  );
}

// Button skeleton
export function SkeletonButton({ className = "" }) {
  return (
    <Skeleton 
      className={className}
      width="w-24"
      height="h-10"
      rounded="rounded-md"
    />
  );
}

// PropTypes
Skeleton.propTypes = {
  className: PropTypes.string,
  width: PropTypes.string,
  height: PropTypes.string,
  rounded: PropTypes.string
}

SkeletonCard.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string
}

SkeletonText.propTypes = {
  lines: PropTypes.number,
  className: PropTypes.string
}

SkeletonImage.propTypes = {
  aspectRatio: PropTypes.string,
  className: PropTypes.string
}

SkeletonButton.propTypes = {
  className: PropTypes.string
}
