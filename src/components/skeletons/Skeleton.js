import PropTypes from 'prop-types'

/**
 * Base skeleton component with consistent styling
 * Used to show loading placeholders with pulse animation
 * @param {Object} props - Component props
 * @param {string} [props.className=''] - Additional CSS classes
 * @param {string} [props.width='w-full'] - Tailwind width class
 * @param {string} [props.height='h-4'] - Tailwind height class
 * @param {string} [props.rounded='rounded'] - Tailwind border radius class
 * @returns {JSX.Element} Animated skeleton placeholder
 */
export function Skeleton({ className = "", width = "w-full", height = "h-4", rounded = "rounded" }) {
  return (
    <div 
      className={`animate-pulse bg-neutral-200 dark:bg-neutral-700 ${width} ${height} ${rounded} ${className}`}
    />
  );
}

/**
 * Card skeleton wrapper
 * Provides a card-style container for skeleton content
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Skeleton elements to display inside card
 * @param {string} [props.className=''] - Additional CSS classes
 * @returns {JSX.Element} Card wrapper with skeleton content
 */
export function SkeletonCard({ children, className = "" }) {
  return (
    <div className={`bg-white dark:bg-neutral-800 rounded-lg shadow-md p-4 space-y-3 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Text skeleton with multiple lines
 * Renders skeleton lines to simulate text content loading
 * @param {Object} props - Component props
 * @param {number} [props.lines=1] - Number of text lines to render
 * @param {string} [props.className=''] - Additional CSS classes
 * @returns {JSX.Element} Multiple skeleton lines simulating text
 */
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

/**
 * Image skeleton placeholder
 * Renders a skeleton placeholder with specific aspect ratio for images
 * @param {Object} props - Component props
 * @param {string} [props.aspectRatio='aspect-video'] - Tailwind aspect ratio class
 * @param {string} [props.className=''] - Additional CSS classes
 * @returns {JSX.Element} Image-shaped skeleton placeholder
 */
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

/**
 * Button skeleton placeholder
 * Renders a button-shaped skeleton for loading states
 * @param {Object} props - Component props
 * @param {string} [props.className=''] - Additional CSS classes
 * @returns {JSX.Element} Button-shaped skeleton placeholder
 */
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
