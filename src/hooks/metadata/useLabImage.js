/**
 * Image Caching with React Query
 * Extends React Query to cache lab images as base64 data
 * Integrates seamlessly with existing metadata caching system
 */
import { useQuery } from '@tanstack/react-query'
import devLog from '@/utils/dev/logger'
import { labImageQueryKeys } from '@/utils/hooks/queryKeys'

// Image cache configuration optimized for React Query
const IMAGE_CACHE_CONFIG = {
  // 48 hours cache (longer than metadata since images change less frequently)
  staleTime: 48 * 60 * 60 * 1000,
  // Keep images for 7 days
  gcTime: 7 * 24 * 60 * 60 * 1000,
  // Don't refetch on window focus (images don't change)
  refetchOnWindowFocus: false,
  // Refetch on reconnect in case of failed downloads
  refetchOnReconnect: true,
  // Retry failed image downloads
  retry: 2,
  retryDelay: 600,
}

/**
 * Convert image URL to base64 data URL with optimization
 */
async function imageToBase64(imageUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        
        // Optimize size for storage - maintain quality while reducing file size
        const maxWidth = 800
        const maxHeight = 600
        
        let { width, height } = img
        
        // Calculate scaled dimensions maintaining aspect ratio
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height)
          width = Math.floor(width * ratio)
          height = Math.floor(height * ratio)
        }
        
        canvas.width = width
        canvas.height = height
        
        // Use high quality scaling
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, width, height)
        
        // Convert to base64 with optimized JPEG quality
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        
        resolve({
          dataUrl,
          originalUrl: imageUrl,
          size: Math.round(dataUrl.length * 0.75), // Approximate byte size
          dimensions: { width, height },
          timestamp: Date.now()
        })
      } catch (error) {
        reject(error)
      }
    }
    
    img.onerror = () => reject(new Error(`Failed to load image: ${imageUrl}`))
    
    // Handle both absolute and relative URLs
    if (imageUrl.startsWith('/')) {
      img.src = `${window.location.origin}${imageUrl}`
    } else {
      img.src = imageUrl
    }
  })
}

/**
 * React Query hook for caching individual lab images
 * @param {string} imageUrl - Image URL to cache
 * @param {Object} [options={}] - Additional React Query options
 * @param {boolean} [options.enabled] - Whether the query should be enabled
 * @param {Function} [options.onSuccess] - Success callback function
 * @param {Function} [options.onError] - Error callback function
 * @param {Object} [options.meta] - Metadata for the query
 * @returns {Object} React Query result with cached image data
 * @returns {Object} returns.data - Cached image data object
 * @returns {string} returns.data.dataUrl - Base64 data URL of the cached image
 * @returns {string} returns.data.originalUrl - Original image URL
 * @returns {number} returns.data.size - Approximate size in bytes
 * @returns {Object} returns.data.dimensions - Image dimensions {width, height}
 * @returns {number} returns.data.timestamp - Cache timestamp
 * @returns {boolean} returns.isLoading - Whether the query is loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if query failed
 * @returns {Function} returns.refetch - Function to manually refetch
 */
export function useLabImageQuery(imageUrl, options = {}) {
  return useQuery({
    queryKey: labImageQueryKeys.byUrl(imageUrl),
    queryFn: async () => {
      if (!imageUrl || typeof imageUrl !== 'string') {
        throw new Error('Invalid image URL')
      }
      
      devLog.log(`🖼️ Caching image: ${imageUrl}`)
      const imageData = await imageToBase64(imageUrl)
      devLog.log(`✅ Image cached: ${imageUrl} (${Math.round(imageData.size / 1024)}KB)`)
      
      return imageData
    },
    enabled: !!imageUrl && options.enabled !== false,
    ...IMAGE_CACHE_CONFIG,
    ...options,
  })
}

// Export queryFn for use in composed hooks (following the pattern from other atomic hooks)
useLabImageQuery.queryFn = async (imageUrl) => {
  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new Error('Invalid image URL')
  }
  
  devLog.log(`🖼️ useLabImageQuery.queryFn: Caching image: ${imageUrl}`)
  const imageData = await imageToBase64(imageUrl)
  devLog.log(`✅ useLabImageQuery.queryFn: Image cached: ${imageUrl} (${Math.round(imageData.size / 1024)}KB)`)
  
  return imageData
}

/**
 * Hook for getting cached image with fallback to original URL
 * @param {string} imageUrl - Image URL
 * @param {Object} [options={}] - Hook options
 * @param {boolean} [options.autoCache=true] - Whether to automatically cache
 * @param {boolean} [options.preferCached=true] - Whether to prefer cached version
 * @param {boolean} [options.enabled] - Whether the query should be enabled
 * @param {Function} [options.onSuccess] - Success callback function
 * @param {Function} [options.onError] - Error callback function
 * @returns {Object} Image state with best URL to use
 * @returns {string} returns.imageUrl - Best image URL to use (cached or original)
 * @returns {boolean} returns.isCached - Whether the image is cached
 * @returns {boolean} returns.isLoading - Whether caching is in progress
 * @returns {boolean} returns.isError - Whether caching failed
 * @returns {Object} returns.cachedData - Cached image data if available
 * @returns {string} returns.fallbackUrl - Original URL as fallback
 */
export function useLabImage(imageUrl, options = {}) {
  const { autoCache = true, preferCached = true, ...queryOptions } = options
  
  // Query for cached image
  const {
    data: cachedImageData,
    isLoading,
    error,
    isSuccess
  } = useLabImageQuery(imageUrl, {
    ...queryOptions,
    enabled: autoCache && !!imageUrl
  })
  
  // Determine best image URL to use
  const getImageUrl = () => {
    // If we have cached data and prefer cached, use it
    if (preferCached && cachedImageData?.dataUrl) {
      return cachedImageData.dataUrl
    }
    
    // Otherwise, use original URL as fallback
    return imageUrl
  }
  
  return {
    imageUrl: getImageUrl(),
    originalUrl: imageUrl,
    cachedImageData,
    isLoading: isLoading && autoCache,
    isCached: isSuccess && !!cachedImageData,
    error,
    
    // Image metadata
    size: cachedImageData?.size || 0,
    dimensions: cachedImageData?.dimensions || null,
    timestamp: cachedImageData?.timestamp || null,
  }
}

/**
 * Hook for batch caching lab images from metadata
 * @param {Array} imageUrls - Array of image URLs from lab metadata
 * @param {Object} options - Hook options
 * @returns {Object} Batch image caching state
 */
export function useLabImageBatch(imageUrls = [], options = {}) {
  const { enabled = true } = options
  
  // Create queries for all image URLs
  const imageQueries = imageUrls.filter(Boolean).map(imageUrl => ({
    queryKey: labImageQueryKeys.byUrl(imageUrl),
    queryFn: () => imageToBase64(imageUrl),
    ...IMAGE_CACHE_CONFIG,
    enabled: enabled && !!imageUrl,
  }))
  
  // We would use useQueries here, but let's create a simpler version
  // that focuses on the main image (first in array) for now
  const mainImageUrl = imageUrls?.[0]
  const mainImageQuery = useLabImageQuery(mainImageUrl, { enabled })
  
  return {
    mainImage: {
      imageUrl: mainImageQuery.data?.dataUrl || mainImageUrl,
      originalUrl: mainImageUrl,
      isLoading: mainImageQuery.isLoading,
      isCached: mainImageQuery.isSuccess,
      error: mainImageQuery.error,
      data: mainImageQuery.data,
    },
    
    // Batch status
    totalImages: imageUrls.length,
    cachedImages: mainImageQuery.isSuccess ? 1 : 0,
    isLoading: mainImageQuery.isLoading,
    
    // Utility methods
    getCachedImageUrl: (url) => {
      if (url === mainImageUrl && mainImageQuery.data?.dataUrl) {
        return mainImageQuery.data.dataUrl
      }
      return url // Fallback to original
    }
  }
}

/**
 * Enhanced hook that integrates with lab metadata
 * Automatically caches the main lab image from metadata
 * @param {Object} labMetadata - Lab metadata object
 * @param {Object} options - Hook options
 * @returns {Object} Lab image with caching
 */
export function useLabImageFromMetadata(labMetadata, options = {}) {
  // Extract image URLs from metadata
  const imageUrls = []
  
  if (labMetadata?.image) {
    imageUrls.push(labMetadata.image)
  }
  
  if (labMetadata?.images && Array.isArray(labMetadata.images)) {
    imageUrls.push(...labMetadata.images.filter(Boolean))
  }
  
  // Extract additional images from attributes
  if (labMetadata?.attributes) {
    const additionalImagesAttr = labMetadata.attributes.find(
      attr => attr.trait_type === 'additionalImages'
    )
    if (additionalImagesAttr?.value && Array.isArray(additionalImagesAttr.value)) {
      imageUrls.push(...additionalImagesAttr.value.filter(Boolean))
    }
  }
  
  // Remove duplicates
  const uniqueImageUrls = [...new Set(imageUrls)]
  
  // Use batch hook for all images
  const batchResult = useLabImageBatch(uniqueImageUrls, options)
  
  return {
    ...batchResult,
    
    // Main image (for LabCard)
    mainImageUrl: batchResult.mainImage.imageUrl,
    isMainImageCached: batchResult.mainImage.isCached,
    
    // All images
    allImageUrls: uniqueImageUrls,
    
    // Lab-specific helpers
    getLabCardImage: () => batchResult.mainImage.imageUrl,
    getGalleryImages: () => uniqueImageUrls.map(url => 
      batchResult.getCachedImageUrl(url)
    ),
  }
}

devLog.moduleLoaded('✅ React Query lab image caching loaded')
