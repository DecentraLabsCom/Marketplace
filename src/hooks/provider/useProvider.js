/**
 * Atomic React Query Hooks for Provider-related operations
 * These hooks provide single-responsibility access to provider endpoints
 * Following the pattern: one hook per API endpoint for consistent caching
 * 
 * @author DecentraLabs
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { labQueryKeys, providerQueryKeys, metadataQueryKeys } from '@/utils/hooks/queryKeys'
import devLog from '@/utils/dev/logger'

// Common configuration for provider hooks
export const PROVIDER_QUERY_CONFIG = {
  staleTime: 5 * 60 * 1000,     // 5 minutes - providers don't change often
  gcTime: 30 * 60 * 1000,       // 30 minutes
  refetchOnWindowFocus: false,
  refetchInterval: false,
  refetchOnReconnect: true,
  retry: 2,
}

/**
 * Hook for getting all lab providers
 * GET /api/contract/provider/getLabProviders
 * 
 * @param {Object} options - React Query options
 * @returns {Object} React Query result with providers data
 */
export const useLabProviders = (options = {}) => {
  return useQuery({
    queryKey: providerQueryKeys.getLabProviders(),
    queryFn: async () => {
      try {
        const response = await fetch('/api/contract/provider/getLabProviders', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch lab providers: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        devLog.info(`Lab providers fetched successfully: ${data.count} providers`);
        return data;
      } catch (error) {
        devLog.error('Failed to fetch lab providers:', error);
        throw error;
      }
    },
    ...PROVIDER_QUERY_CONFIG,
    ...options,
  });
};

// Export queryFn for use in composed hooks
export const labProvidersQueryFn = async () => {
  const response = await fetch('/api/contract/provider/getLabProviders', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch lab providers: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  devLog.info(`Lab providers fetched successfully (queryFn): ${data.count} providers`);
  return data;
};

// Attach queryFn to hook for backward compatibility
useLabProviders.queryFn = labProvidersQueryFn;

/**
 * Hook for saving lab data
 * POST /api/provider/saveLabData
 * 
 * @param {Object} options - React Query mutation options
 * @returns {Object} React Query mutation result
 */
export const useSaveLabData = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (labData) => {
      try {
        if (!labData) {
          throw new Error('Lab data is required');
        }

        const response = await fetch('/api/provider/saveLabData', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ labData })
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to save lab data: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.info('Lab data saved successfully');
        return data;
      } catch (error) {
        devLog.error('Failed to save lab data:', error);
        throw error;
      }
    },
    onSuccess: (data, variables) => {
      devLog.log('🔄 [useSaveLabData] onSuccess - starting cache updates for:', variables?.uri);
      
      // Invalidate the specific metadata query that changed
      if (variables?.uri) {
        devLog.log('🔄 [useSaveLabData] About to invalidate metadata query with key:', metadataQueryKeys.byUri(variables.uri));
        
        const result = queryClient.invalidateQueries({ 
          queryKey: metadataQueryKeys.byUri(variables.uri),
          exact: true,
          refetchType: 'all' // Force refetch all queries, bypassing staleTime
        });
        
        devLog.log('🔄 [useSaveLabData] Invalidation result:', result);
        devLog.log('✅ [useSaveLabData] Invalidated metadata cache for:', variables.uri);
        
        // Debug: Log all current queries to see what's in cache
        const queries = queryClient.getQueryCache().getAll();
        const metadataQueries = queries.filter(q => q.queryKey.includes('metadata'));
        devLog.log('🔍 [useSaveLabData] Current metadata queries in cache:', 
          metadataQueries.map(q => ({ 
            queryKey: q.queryKey, 
            state: q.state.status,
            dataUpdatedAt: q.state.dataUpdatedAt,
            isStale: q.isStale()
          }))
        );
      }
      
      devLog.log('✅ [useSaveLabData] Cache invalidation completed');
    },
    ...options,
  });
};

/**
 * Hook for saving provider registration
 * POST /api/provider/saveRegistration
 * 
 * @param {Object} options - React Query mutation options
 * @returns {Object} React Query mutation result
 */
export const useSaveProviderRegistration = (options = {}) => {
  return useMutation({
    mutationFn: async (providerData) => {
      try {
        if (!providerData) {
          throw new Error('Provider data is required');
        }

        const response = await fetch('/api/provider/saveRegistration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(providerData)
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to save provider registration: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.info('Provider registration saved successfully');
        return data;
      } catch (error) {
        devLog.error('Failed to save provider registration:', error);
        throw error;
      }
    },
    ...options,
  });
};

/**
 * Hook for uploading files
 * POST /api/provider/uploadFile
 * 
 * @param {Object} options - React Query mutation options
 * @returns {Object} React Query mutation result
 */
export const useUploadFile = (options = {}) => {
  return useMutation({
    mutationFn: async ({ file, destinationFolder, labId }) => {
      try {
        if (!file) {
          throw new Error('File is required');
        }
        if (!destinationFolder) {
          throw new Error('Destination folder is required');
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('destinationFolder', destinationFolder);
        if (labId) {
          formData.append('labId', labId);
        }

        const response = await fetch('/api/provider/uploadFile', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to upload file: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.info(`File uploaded successfully: ${data.filePath}`);
        return data;
      } catch (error) {
        devLog.error('Failed to upload file:', error);
        throw error;
      }
    },
    ...options,
  });
};

/**
 * Hook for deleting files
 * POST /api/provider/deleteFile
 * 
 * @param {Object} options - React Query mutation options
 * @returns {Object} React Query mutation result
 */
export const useDeleteFile = (options = {}) => {
  return useMutation({
    mutationFn: async ({ filePath, deletingLab = false }) => {
      try {
        if (!filePath) {
          throw new Error('File path is required');
        }

        const formData = new FormData();
        formData.append('filePath', filePath);
        formData.append('deletingLab', deletingLab.toString());

        const response = await fetch('/api/provider/deleteFile', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to delete file: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.info(`File deleted successfully: ${filePath}`);
        return data;
      } catch (error) {
        devLog.error('Failed to delete file:', error);
        throw error;
      }
    },
    ...options,
  });
};

/**
 * Hook for deleting lab data
 * POST /api/provider/deleteLabData
 * 
 * @param {Object} options - React Query mutation options
 * @returns {Object} React Query mutation result
 */
export const useDeleteLabData = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (labURI) => {
      try {
        if (!labURI) {
          throw new Error('Lab URI is required');
        }

        const response = await fetch('/api/provider/deleteLabData', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ labURI })
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to delete lab data: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.info(`Lab data deleted successfully: ${labURI}`);
        return data;
      } catch (error) {
        devLog.error('Failed to delete lab data:', error);
        throw error;
      }
    },
    onSuccess: (data, labURI) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: metadataQueryKeys.all() });
      queryClient.invalidateQueries({ queryKey: metadataQueryKeys.byUri(labURI) });
    },
    ...options,
  });
};

// Module loaded confirmation (only logs once even in StrictMode)
devLog.moduleLoaded('✅ Provider atomic hooks loaded');
