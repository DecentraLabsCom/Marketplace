/**
 * Atomic React Query Hooks for Metadata-related operations
 * These hooks provide single-responsibility access to metadata endpoints
 * Following the pattern: one hook per API endpoint for consistent caching
 * 
 * @author DecentraLabs
 */
import { useQuery } from '@tanstack/react-query'
import devLog from '@/utils/dev/logger'

// Common configuration for metadata hooks
const METADATA_QUERY_CONFIG = {
  staleTime: 2 * 60 * 60 * 1000,    // 2 hours - metadata doesn't change often
  gcTime: 24 * 60 * 60 * 1000,      // 24 hours
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
  retry: 2,
}

// Export configuration for use in composed hooks
export { METADATA_QUERY_CONFIG };

/**
 * Hook for fetching metadata by URI
 * GET /api/metadata?uri={metadataUri}
 * 
 * @param {string} metadataUri - Metadata URI to fetch (required)
 * @param {Object} options - React Query options
 * @returns {Object} React Query result with metadata
 */
export const useMetadata = (metadataUri, options = {}) => {
  return useQuery({
    queryKey: ['metadata', metadataUri],
    queryFn: async () => {
      try {
        if (!metadataUri) {
          throw new Error('Metadata URI is required');
        }

        devLog.log(`🔍 useMetadata queryFn: Fetching metadata for ${metadataUri}`);

        const response = await fetch(`/api/metadata?uri=${encodeURIComponent(metadataUri)}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error(`Metadata not found: ${metadataUri}`);
          }
          throw new Error(`Failed to fetch metadata: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        devLog.info(`✅ useMetadata queryFn: Metadata fetched successfully for URI: ${metadataUri}`);
        return data;
      } catch (error) {
        devLog.error('Failed to fetch metadata:', error);
        throw error;
      }
    },
    enabled: !!metadataUri && options.enabled !== false,
    ...METADATA_QUERY_CONFIG, // ✅ Using shared configuration
    ...options,
  });
};

// Export queryFn for use in composed hooks
useMetadata.queryFn = async ({ metadataUri }) => {
  if (!metadataUri) {
    throw new Error('Metadata URI is required');
  }

  devLog.log(`🔍 useMetadata.queryFn: Fetching metadata for ${metadataUri}`);

  const response = await fetch(`/api/metadata?uri=${encodeURIComponent(metadataUri)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Metadata not found: ${metadataUri}`);
    }
    throw new Error(`Failed to fetch metadata: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  devLog.log(`✅ useMetadata.queryFn: Metadata fetched successfully for URI: ${metadataUri}`);
  return data;
};

/**
 * Hook for fetching metadata by URI with select transformation
 * Only returns the essential metadata fields needed by components
 * @param {string} metadataUri - Metadata URI to fetch (required)
 * @param {Object} options - React Query options with default config
 * @returns {Object} Optimized metadata for components
 */
export function useMetadataOptimized(metadataUri, options = {}) {
  const config = { ...METADATA_QUERY_CONFIG, ...options }
  
  return useQuery({
    queryKey: ['metadata', metadataUri],
    queryFn: () => useMetadata.queryFn(metadataUri),
    select: (data) => ({
      // Only return essential metadata fields for components
      name: data.name || 'Unnamed Lab',
      description: data.description || '',
      category: data.category || 'General',
      images: Array.isArray(data.images) ? data.images.slice(0, 5) : [], // Limit to 5 images
      docs: Array.isArray(data.docs) ? data.docs.slice(0, 3) : [], // Limit to 3 docs
      keywords: Array.isArray(data.keywords) ? data.keywords.slice(0, 10) : [],
      // Essential fields only
      hasImages: Array.isArray(data.images) && data.images.length > 0,
      hasDocs: Array.isArray(data.docs) && data.docs.length > 0,
      imageCount: Array.isArray(data.images) ? data.images.length : 0,
      docCount: Array.isArray(data.docs) ? data.docs.length : 0,
    }),
    enabled: !!metadataUri && config.enabled !== false,
    ...config,
  })
}

// Module loaded confirmation (only logs once even in StrictMode)
devLog.moduleLoaded('✅ Metadata atomic hooks loaded');
