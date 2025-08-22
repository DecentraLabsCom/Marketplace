/**
 * Image Caching with React Query
 * Extends React Query to cache lab images as base64 data
 * Integrates seamlessly with existing metadata caching system
 */
import { useQuery, useQueries } from '@tanstack/react-query'
import { createSSRSafeQuery } from '@/utils/hooks/ssrSafe'
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

// Define queryFn first for reuse
const getLabImageQueryFn = createSSRSafeQuery(async (imageUrl) => {
  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new Error('Invalid image URL')
  }
  
  devLog.log(`🖼️ getLabImageQueryFn: Caching image: ${imageUrl}`)
  const imageData = await imageToBase64(imageUrl)
  devLog.log(`✅ getLabImageQueryFn: Image cached: ${imageUrl} (${Math.round(imageData.size / 1024)}KB)`)
  
  return imageData
}, null) // Return null during SSR

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
    queryFn: () => getLabImageQueryFn(imageUrl), // ✅ Reuse the SSR-safe queryFn
    enabled: !!imageUrl && options.enabled !== false,
    ...IMAGE_CACHE_CONFIG,
    ...options,
  })
}

// Export queryFn for use in composed hooks
useLabImageQuery.queryFn = getLabImageQueryFn;

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
 * Uses useQueries for efficient parallel image caching
 * @param {Array} imageUrls - Array of image URLs from lab metadata
 * @param {Object} options - Hook options
 * @param {boolean} [options.enabled=true] - Whether the queries should be enabled
 * @param {Function} [options.onSuccess] - Success callback function
 * @param {Function} [options.onError] - Error callback function
 * @returns {Object} Batch image caching state
 * @returns {Object} returns.mainImage - Main image data and state
 * @returns {Array} returns.allImages - Array of all image results
 * @returns {number} returns.totalImages - Total number of images
 * @returns {number} returns.cachedImages - Number of successfully cached images
 * @returns {number} returns.loadingImages - Number of images currently loading
 * @returns {number} returns.errorImages - Number of images that failed to load
 * @returns {boolean} returns.isAllLoaded - Whether all images are loaded
 * @returns {boolean} returns.isAnyLoading - Whether any images are loading
 * @returns {Function} returns.getCachedImageUrl - Utility to get cached URL for any image
 */
export function useLabImageBatch(imageUrls = [], options = {}) {
  const { enabled = true, onSuccess, onError } = options
  
  // Filter out invalid URLs and remove duplicates
  const validImageUrls = [...new Set(imageUrls.filter(Boolean))]
  
  // Create queries for all image URLs using useQueries
  const imageQueries = useQueries({
    queries: validImageUrls.map(imageUrl => ({
      queryKey: labImageQueryKeys.byUrl(imageUrl),
      queryFn: () => getLabImageQueryFn(imageUrl), // ✅ Reuse the SSR-safe queryFn
      ...IMAGE_CACHE_CONFIG,
      enabled: enabled && !!imageUrl,
      onSuccess: (data) => {
        devLog.log(`✅ [useLabImageBatch] Image cached: ${imageUrl}`)
        onSuccess?.(data, imageUrl)
      },
      onError: (error) => {
        devLog.error(`❌ [useLabImageBatch] Image cache failed: ${imageUrl}`, error)
        onError?.(error, imageUrl)
      },
    }))
  })
  
  // Calculate batch statistics
  const totalImages = validImageUrls.length
  const cachedImages = imageQueries.filter(query => query.isSuccess).length
  const loadingImages = imageQueries.filter(query => query.isLoading).length
  const errorImages = imageQueries.filter(query => query.isError).length
  
  // Main image (first in array)
  const mainImageQuery = imageQueries[0]
  const mainImageUrl = validImageUrls[0]
  
  // Create a map for quick URL lookups
  const urlToQueryMap = new Map()
  validImageUrls.forEach((url, index) => {
    urlToQueryMap.set(url, imageQueries[index])
  })
  
  return {
    // Main image data
    mainImage: {
      imageUrl: mainImageQuery?.data?.dataUrl || mainImageUrl,
      originalUrl: mainImageUrl,
      isLoading: mainImageQuery?.isLoading || false,
      isCached: mainImageQuery?.isSuccess || false,
      error: mainImageQuery?.error || null,
      data: mainImageQuery?.data || null,
    },
    
    // All images data
    allImages: imageQueries.map((query, index) => ({
      imageUrl: query.data?.dataUrl || validImageUrls[index],
      originalUrl: validImageUrls[index],
      isLoading: query.isLoading,
      isCached: query.isSuccess,
      error: query.error,
      data: query.data,
    })),
    
    // Batch statistics
    totalImages,
    cachedImages,
    loadingImages,
    errorImages,
    isAllLoaded: totalImages > 0 && cachedImages === totalImages,
    isAnyLoading: loadingImages > 0,
    
    // Utility methods
    getCachedImageUrl: (url) => {
      const query = urlToQueryMap.get(url)
      return query?.data?.dataUrl || url // Fallback to original URL
    },
    
    // Additional utilities
    getCachedImageData: (url) => {
      const query = urlToQueryMap.get(url)
      return query?.data || null
    },
    
    getImageStatus: (url) => {
      const query = urlToQueryMap.get(url)
      if (!query) return 'not-found'
      if (query.isLoading) return 'loading'
      if (query.isError) return 'error'
      if (query.isSuccess) return 'cached'
      return 'idle'
    },
  }
}

/**
 * Enhanced hook that integrates with lab metadata
 * Automatically caches all lab images from metadata using parallel queries
 * @param {Object} labMetadata - Lab metadata object
 * @param {Object} [options={}] - Hook options
 * @param {boolean} [options.enabled=true] - Whether the queries should be enabled
 * @param {Function} [options.onSuccess] - Success callback for individual images
 * @param {Function} [options.onError] - Error callback for individual images
 * @returns {Object} Lab image with comprehensive caching
 * @returns {string} returns.mainImageUrl - Main lab image URL (cached or original)
 * @returns {boolean} returns.isMainImageCached - Whether main image is cached
 * @returns {Array} returns.allImageUrls - All unique image URLs from metadata
 * @returns {Array} returns.allImages - All image results with caching data
 * @returns {number} returns.totalImages - Total number of images
 * @returns {number} returns.cachedImages - Number of successfully cached images
 * @returns {boolean} returns.isAllLoaded - Whether all images are cached
 * @returns {boolean} returns.isAnyLoading - Whether any images are loading
 * @returns {Function} returns.getLabCardImage - Get optimized image for LabCard
 * @returns {Function} returns.getGalleryImages - Get all images for gallery view
 * @returns {Function} returns.getCachedImageUrl - Get cached URL for specific image
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
  
  // Remove duplicates and filter valid URLs
  const uniqueImageUrls = [...new Set(imageUrls.filter(Boolean))]
  
  // Use batch hook for all images with parallel caching
  const batchResult = useLabImageBatch(uniqueImageUrls, options)
  
  return {
    // Expose all batch functionality
    ...batchResult,
    
    // Main image convenience properties (for LabCard)
    mainImageUrl: batchResult.mainImage.imageUrl,
    isMainImageCached: batchResult.mainImage.isCached,
    
    // All images
    allImageUrls: uniqueImageUrls,
    
    // Lab-specific helper functions
    getLabCardImage: () => {
      // Return the best available main image (cached if available)
      return batchResult.mainImage.imageUrl
    },
    
    getGalleryImages: () => {
      // Return all images with their cached versions
      return batchResult.allImages.map(img => ({
        url: img.imageUrl, // Cached or original
        originalUrl: img.originalUrl,
        isCached: img.isCached,
        isLoading: img.isLoading,
        error: img.error,
        data: img.data,
      }))
    },
    
    // Enhanced metadata-specific utilities
    getImageByIndex: (index) => {
      const image = batchResult.allImages[index]
      return image ? image.imageUrl : null
    },
    
    getMainImageData: () => {
      return batchResult.mainImage.data
    },
    
    // Performance metrics
    getCacheEfficiency: () => {
      if (batchResult.totalImages === 0) return 0
      return (batchResult.cachedImages / batchResult.totalImages) * 100
    },
  }
}

devLog.moduleLoaded('✅ React Query lab image caching loaded with useQueries batch support')
