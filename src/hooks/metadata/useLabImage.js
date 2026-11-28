/**
 * Image Caching with React Query
 * Extends React Query to cache lab images as base64 data
 * Integrates seamlessly with existing metadata caching system
 */
import { useQuery } from '@tanstack/react-query'
import { createSSRSafeQuery } from '@/utils/hooks/ssrSafe'
import devLog from '@/utils/dev/logger'
import { labImageQueryKeys } from '@/utils/hooks/queryKeys'
import { resolveLabImageUrl } from '@/utils/media/resolveMediaUrl'

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
  retry: 1,
  retryDelay: 250,
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
const getLabImageQueryFn = createSSRSafeQuery(async (imageUrl, labId = null) => {
  if (!imageUrl || typeof imageUrl !== 'string') {
    throw new Error('Invalid image URL')
  }

  const resolvedImageUrl = resolveLabImageUrl(imageUrl, labId)
  devLog.log(`🖼️ getLabImageQueryFn: Caching image: ${resolvedImageUrl}`)
  const imageData = await imageToBase64(resolvedImageUrl)
  devLog.log(`✅ getLabImageQueryFn: Image cached: ${resolvedImageUrl} (${Math.round(imageData.size / 1024)}KB)`)

  return {
    ...imageData,
    originalUrl: imageUrl,
    resolvedUrl: resolvedImageUrl,
  }
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
  const { labId = null, ...queryOptions } = options

  return useQuery({
    queryKey: labImageQueryKeys.byUrl(imageUrl, labId),
    queryFn: () => getLabImageQueryFn(imageUrl, labId), // ✅ Reuse the SSR-safe queryFn
    enabled: !!imageUrl && options.enabled !== false,
    ...IMAGE_CACHE_CONFIG,
    ...queryOptions,
  })
}

// Export queryFn for use in composed hooks
useLabImageQuery.queryFn = getLabImageQueryFn;

devLog.moduleLoaded('✅ React Query lab image caching loaded with useQueries batch support')
