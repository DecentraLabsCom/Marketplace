/**
 * Atomic React Query Hooks for Metadata-related operations
 * These hooks provide single-responsibility access to metadata endpoints
 * Following the pattern: one hook per API endpoint for consistent caching
 */
import { useQuery } from '@tanstack/react-query'
import { metadataQueryKeys } from '@/utils/hooks/queryKeys'
import { createSSRSafeQuery } from '@/utils/hooks/ssrSafe'
import devLog from '@/utils/dev/logger'

// Common configuration for metadata hooks
const METADATA_QUERY_CONFIG = {
  staleTime: 2 * 60 * 60 * 1000,    // 2 hours - metadata doesn't change often
  gcTime: 24 * 60 * 60 * 1000,      // 24 hours
  refetchOnWindowFocus: false,
  refetchOnReconnect: true,
  retry: 1,
  networkMode: 'online',             // Only fetch when online
}

// Export configuration for use in composed hooks
export { METADATA_QUERY_CONFIG };

// Define queryFn first for reuse
const getMetadataQueryFn = createSSRSafeQuery(async (metadataUri) => {
  try {
    if (!metadataUri) {
      throw new Error('Metadata URI is required');
    }

    devLog.log(`🔍 getMetadataQueryFn: Fetching metadata for ${metadataUri}`);

    // Add timeout to fetch using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    try {
      const response = await fetch(`/api/metadata?uri=${encodeURIComponent(metadataUri)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Metadata not found: ${metadataUri}`);
        }
        if (response.status === 408) {
          throw new Error(`Metadata fetch timeout: ${metadataUri}`);
        }
        throw new Error(`Failed to fetch metadata: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      devLog.info(`✅ getMetadataQueryFn: Metadata fetched successfully for URI: ${metadataUri}`);
      return data;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error(`Metadata fetch timeout: ${metadataUri}`, { cause: fetchError });
      }
      throw new Error(`Metadata fetch failed: ${fetchError && fetchError.message ? fetchError.message : fetchError}`, { cause: fetchError });
    }
  } catch (error) {
    devLog.error('Failed to fetch metadata:', error);
    throw new Error(`Metadata fetch failed: ${error && error.message ? error.message : error}`, { cause: error });
  }
}, null); // Return null during SSR

/**
 * Hook for fetching metadata by URI
 * GET /api/metadata?uri={metadataUri}
 * 
 * @param {string} metadataUri - Metadata URI to fetch (required)
 * @param {Object} [options={}] - React Query options
 * @param {boolean} [options.enabled] - Whether the query should be enabled
 * @param {Function} [options.onSuccess] - Success callback function
 * @param {Function} [options.onError] - Error callback function
 * @param {Object} [options.meta] - Metadata for the query
 * @returns {Object} React Query result with metadata
 * @returns {Object} returns.data - Lab metadata object
 * @returns {string} returns.data.name - Lab name
 * @returns {string} returns.data.description - Lab description
 * @returns {string} returns.data.image - Main lab image URL
 * @returns {Array} returns.data.images - Array of additional image URLs
 * @returns {string} returns.data.category - Lab category
 * @returns {Array} returns.data.attributes - Array of metadata attributes
 * @returns {boolean} returns.isLoading - Whether the query is loading
 * @returns {boolean} returns.isError - Whether the query has an error
 * @returns {Error|null} returns.error - Error object if query failed
 * @returns {Function} returns.refetch - Function to manually refetch
 */
export const useMetadata = (metadataUri, options = {}) => {
  return useQuery({
    queryKey: metadataQueryKeys.byUri(metadataUri),
    queryFn: () => getMetadataQueryFn(metadataUri), // ✅ Reuse the SSR-safe queryFn
    enabled: !!metadataUri && options.enabled !== false,
    ...METADATA_QUERY_CONFIG, // ✅ Using shared configuration
    ...options,
  });
}

// Export queryFn for use in composed hooks
useMetadata.queryFn = getMetadataQueryFn;

// Module loaded confirmation (only logs once even in StrictMode)
devLog.moduleLoaded('✅ Metadata atomic hooks loaded');
