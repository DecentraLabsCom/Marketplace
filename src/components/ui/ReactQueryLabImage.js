/**
 * React Query-based Lab Image Component
 * Uses React Query's caching system for optimal image caching
 * Integrates seamlessly with existing metadata caching
 */
import React, { useState } from 'react'
import PropTypes from 'prop-types'
import Image from 'next/image'
import { useLabImage } from '@/hooks/metadata/useLabImage'
import { Spinner } from '@/components/ui'
import devLog from '@/utils/dev/logger'

/**
 * Lab image component with React Query-based caching
 * @param {Object} props
 * @param {string} props.src - Image source URL
 * @param {string} props.alt - Alt text for image
 * @param {number|string} props.width - Image width
 * @param {number|string} props.height - Image height
 * @param {string} props.className - CSS classes
 * @param {string} props.sizes - Responsive image sizes
 * @param {boolean} props.priority - Whether to prioritize loading
 * @param {boolean} props.fill - Whether to fill container
 * @param {Object} props.style - Inline styles
 * @param {boolean} props.autoCache - Whether to auto-cache (default: true)
 * @param {boolean} props.showCacheStatus - Whether to show cache status in dev
 * @param {string} props.fallbackSrc - Fallback image URL
 * @param {Function} props.onLoad - Callback when image loads
 * @param {Function} props.onError - Callback when image fails to load
 * @returns {JSX.Element}
 */
const ReactQueryLabImage = ({
  src,
  alt,
  width,
  height,
  className = '',
  sizes,
  priority = false,
  fill = false,
  style = {},
  autoCache = true,
  showCacheStatus = false,
  fallbackSrc = '/labs/lab_placeholder.png',
  onLoad,
  onError,
  ...props
}) => {
  const [imageFailed, setImageFailed] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  
  // Use React Query for image caching
  const {
    imageUrl,
    originalUrl,
    isLoading: isCaching,
    isCached,
    error: cacheError
  } = useLabImage(src, { 
    autoCache,
    // In development, prefer cached to test the system
    // In production, prefer original for better initial loading
    preferCached: process.env.NODE_ENV === 'development' 
  })

  // Determine which image to show
  const displayImageUrl = imageFailed ? fallbackSrc : imageUrl

  // Handle image load success
  const handleLoad = (event) => {
    setImageLoaded(true)
    if (onLoad) onLoad(event)
    
    if (process.env.NODE_ENV === 'development') {
      devLog.log(`🖼️ Image loaded:  ${isCached ? '(cached)' : '(original)'}`)
    }
  }

  // Handle image load error
  const handleError = (event) => {
    setImageFailed(true)
    if (onError) onError(event)
    
    devLog.warn(`❌ Image failed to load: ${displayImageUrl}`, { 
      cacheError, 
      originalUrl,
      isCached 
    })
  }

  // Common image props
  const imageProps = {
    src: displayImageUrl,
    alt,
    className: `${className} ${!imageLoaded ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`,
    onLoad: handleLoad,
    onError: handleError,
    style,
    ...props
  }

  // Add dimension props conditionally
  if (width && !fill) imageProps.width = width
  if (height && !fill) imageProps.height = height
  if (sizes) imageProps.sizes = sizes
  if (priority) imageProps.priority = priority
  if (fill) imageProps.fill = fill

  return (
    <div className="relative size-full">
      <Image {...imageProps} />
      
      {/* Loading placeholder */}
      {!imageLoaded && (
        <div className="absolute inset-0 bg-neutral-200 animate-pulse flex items-center justify-center">
          <Spinner 
            size="md" 
            color="primary-600"
            label={isCaching ? 'Caching image...' : 'Loading image...'}
            className="text-neutral-500"
          />
        </div>
      )}
    </div>
  )
}

ReactQueryLabImage.propTypes = {
  src: PropTypes.string.isRequired,
  alt: PropTypes.string.isRequired,
  width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  className: PropTypes.string,
  sizes: PropTypes.string,
  priority: PropTypes.bool,
  fill: PropTypes.bool,
  style: PropTypes.object,
  autoCache: PropTypes.bool,
  showCacheStatus: PropTypes.bool,
  fallbackSrc: PropTypes.string,
  onLoad: PropTypes.func,
  onError: PropTypes.func
}

/**
 * Specialized component for lab cards
 * Pre-configured with optimal settings for card images
 */
export const LabCardImage = ({ src, alt, labId, className = '', ...props }) => {
  return (
    <ReactQueryLabImage
      src={src}
      alt={alt || `Lab ${labId} image`}
      fill={true} // ✅ Fill the container completely
      className={`object-cover ${className}`} // ✅ Ensure object-cover is applied
      autoCache={true}
      showCacheStatus={process.env.NODE_ENV === 'development'}
      priority={false}
      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
      {...props}
    />
  )
}

LabCardImage.propTypes = {
  src: PropTypes.string.isRequired,
  alt: PropTypes.string,
  labId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  className: PropTypes.string
}

export default ReactQueryLabImage
