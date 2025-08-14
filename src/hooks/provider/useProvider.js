/**
 * Atomic React Query Hooks for Provider-related operations
 * These hooks provide single-responsibility access to provider endpoints
 * Following the pattern: one hook per API endpoint for consistent caching
 * 
 * @author DecentraLabs
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { labQueryKeys } from '@/utils/hooks/queryKeys'
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
 * @param {Function} options.select - Optional data transformation function (React Query select)
 * @returns {Object} React Query result with providers data
 */
export const useLabProviders = (options = {}) => {
  return useQuery({
    queryKey: ['providers', 'getLabProviders'],
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
        devLog.log('🔄 [useSaveLabData] About to invalidate metadata query with key:', ['metadata', variables.uri]);
        
        const result = queryClient.invalidateQueries({ 
          queryKey: ['metadata', variables.uri],
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
      queryClient.invalidateQueries({ queryKey: ['metadata'] });
      queryClient.invalidateQueries({ queryKey: ['metadata', labURI] });
    },
    ...options,
  });
};

// ===== SPECIALIZED HOOKS WITH SELECT TRANSFORMATIONS =====

/**
 * Hook for getting providers optimized for dropdown/select components
 * @param {Object} options - React Query options
 * @returns {Object} React Query result with dropdown-optimized provider data
 */
export const useProvidersForDropdown = (options = {}) => {
  return useLabProviders({
    select: (data) => ({
      // Transform for dropdown components
      options: data.providers.map(provider => ({
        value: provider.account,
        label: provider.name,
        email: provider.email,
        country: provider.country,
        isActive: provider.isActive !== false
      })).sort((a, b) => a.label.localeCompare(b.label)),
      
      // Quick lookup
      totalProviders: data.count,
      activeProviders: data.providers.filter(p => p.isActive !== false).length
    }),
    ...PROVIDER_QUERY_CONFIG, // ✅ Use default provider configuration
    ...options                // Allow override if needed
  });
};

/**
 * Hook for getting providers optimized for marketplace filtering
 * Pre-processes provider names for filter options
 * @param {Object} options - React Query options
 * @returns {Object} React Query result with filter-optimized provider data
 */
export const useProvidersForFilters = (options = {}) => {
  return useLabProviders({
    select: (data) => ({
      // Provider names for filtering
      providerNames: [...new Set(data.providers
        .filter(p => p.isActive !== false && p.name)
        .map(p => p.name))]
        .sort(),
      
      // Provider mapping for lookup
      providerMap: data.providers.reduce((map, provider) => {
        map[provider.name] = {
          account: provider.account,
          email: provider.email,
          country: provider.country,
          labCount: provider.labCount || 0
        };
        return map;
      }, {}),
      
      // Geography breakdown
      countries: [...new Set(data.providers
        .filter(p => p.country)
        .map(p => p.country))]
        .sort(),
      
      // Statistics
      totalProviders: data.count,
      activeProviders: data.providers.filter(p => p.isActive !== false).length,
      countriesCount: new Set(data.providers.filter(p => p.country).map(p => p.country)).size
    }),
    ...PROVIDER_QUERY_CONFIG, // ✅ Use default provider configuration
    ...options                // Allow override if needed
  });
};

/**
 * Hook for getting provider statistics and analytics
 * Optimized for admin dashboard and analytics views
 * @param {Object} options - React Query options
 * @returns {Object} React Query result with analytics-optimized provider data
 */
export const useProviderAnalytics = (options = {}) => {
  return useLabProviders({
    select: (data) => {
      const activeProviders = data.providers.filter(p => p.isActive !== false);
      const inactiveProviders = data.providers.filter(p => p.isActive === false);
      
      // Country distribution
      const countryStats = data.providers.reduce((stats, provider) => {
        if (provider.country) {
          stats[provider.country] = (stats[provider.country] || 0) + 1;
        }
        return stats;
      }, {});
      
      // Lab count distribution
      const labCountStats = data.providers.reduce((stats, provider) => {
        const labCount = provider.labCount || 0;
        const bucket = labCount === 0 ? '0' : 
                      labCount <= 2 ? '1-2' : 
                      labCount <= 5 ? '3-5' : 
                      labCount <= 10 ? '6-10' : '10+';
        stats[bucket] = (stats[bucket] || 0) + 1;
        return stats;
      }, {});
      
      return {
        // Provider counts
        total: data.count,
        active: activeProviders.length,
        inactive: inactiveProviders.length,
        
        // Top providers by lab count
        topProviders: data.providers
          .filter(p => p.labCount > 0)
          .sort((a, b) => (b.labCount || 0) - (a.labCount || 0))
          .slice(0, 10)
          .map(provider => ({
            name: provider.name,
            account: provider.account,
            labCount: provider.labCount || 0,
            country: provider.country,
            email: provider.email
          })),
        
        // Geographic distribution
        geographic: {
          countries: Object.keys(countryStats).length,
          distribution: Object.entries(countryStats)
            .sort(([,a], [,b]) => b - a)
            .map(([country, count]) => ({ country, count })),
          topCountries: Object.entries(countryStats)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
        },
        
        // Lab distribution
        labDistribution: Object.entries(labCountStats)
          .map(([range, count]) => ({ range, count })),
        
        // Average labs per provider
        averageLabsPerProvider: data.providers.length > 0 
          ? data.providers.reduce((sum, p) => sum + (p.labCount || 0), 0) / data.providers.length 
          : 0,
        
        // Recently added (if we have timestamp data)
        recentProviders: data.providers
          .slice(-5) // Last 5 added (assuming array order represents addition order)
          .map(provider => ({
            name: provider.name,
            account: provider.account,
            country: provider.country
          }))
      };
    },
    ...PROVIDER_QUERY_CONFIG, // ✅ Use default provider configuration
    ...options                // Allow override if needed
  });
};

// Module loaded confirmation (only logs once even in StrictMode)
devLog.moduleLoaded('✅ Provider atomic hooks loaded');
