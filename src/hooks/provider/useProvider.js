/**
 * Atomic React Query Hook Mutations for Provider-related operations
 * These hooks provide single-responsibility access to provider endpoints
 * Following the pattern: one hook per API endpoint for consistent caching
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { metadataQueryKeys } from '@/utils/hooks/queryKeys'
import devLog from '@/utils/dev/logger'


/**
 * Hook for saving lab data
 * POST /api/provider/saveLabData
 * 
 * @param {Object} [options={}] - React Query mutation options
 * @param {Function} [options.onSuccess] - Success callback function
 * @param {Function} [options.onError] - Error callback function
 * @param {Function} [options.onMutate] - Optimistic update function
 * @param {Object} [options.meta] - Metadata for the mutation
 * @returns {Object} React Query mutation result
 * @returns {Function} returns.mutate - Execute the mutation function
 * @returns {Function} returns.mutateAsync - Execute the mutation with promise
 * @returns {boolean} returns.isPending - Whether the mutation is pending
 * @returns {boolean} returns.isError - Whether the mutation has an error
 * @returns {Error|null} returns.error - Error object if mutation failed
 * @returns {any} returns.data - Data returned from successful mutation
 */
export const useSaveLabData = (options = {}) => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (labData) => {
      try {
        if (!labData) {
          throw new Error('Lab data is required');
        }

        // Add timestamp and cache-busting query param for Vercel production
        const timestamp = Date.now();
        const response = await fetch('/api/provider/saveLabData', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          },
          body: JSON.stringify({ labData, timestamp })
        });
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to save lab data: ${response.status}`);
        }
        
        const data = await response.json();
        devLog.info('Lab data saved successfully', { uri: labData.uri, timestamp });
        return { ...data, timestamp };
      } catch (error) {
        devLog.error('Failed to save lab data:', error);
        throw error;
      }
    },
    onSuccess: async (data, variables) => {
      devLog.log('🔄 [useSaveLabData] onSuccess - starting cache updates for:', variables?.uri);
      
      if (variables?.uri) {
        // Step 1: Remove the old data from cache immediately
        queryClient.removeQueries({
          queryKey: metadataQueryKeys.byUri(variables.uri),
          exact: true
        });
        devLog.log('�️ [useSaveLabData] Removed old cache for:', variables.uri);
        
        // Step 2: Add a small delay to ensure blob propagation in Vercel
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Step 3: Force invalidation with aggressive settings
        await queryClient.invalidateQueries({ 
          queryKey: metadataQueryKeys.byUri(variables.uri),
          exact: true,
          refetchType: 'all'
        });
        
        // Step 4: Also invalidate broader metadata patterns to catch composed queries
        /*await queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey;
            return Array.isArray(key) && 
                   key.some(segment => 
                     typeof segment === 'string' && 
                     (segment.includes('metadata') || segment === variables.uri)
                   );
          },
          refetchType: 'all'
        });*/
        
        devLog.log('✅ [useSaveLabData] Cache invalidation completed for:', variables.uri);
      }
    },
    onError: (error, variables) => {
      devLog.error('❌ [useSaveLabData] Mutation failed for:', variables?.uri, error);
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
