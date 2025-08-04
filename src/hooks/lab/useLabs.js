/**
 * React Query Hooks for Lab-related data
 * Uses simple hooks with composed services and cache-extracting hooks
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { labServices } from '@/services/labServices'
import { QUERY_KEYS } from '@/utils/hooks/queryKeys'
import devLog from '@/utils/dev/logger'

// === SIMPLE HOOKS WITH COMPOSED SERVICES ===

/**
 * Hook to get all labs with complete details using composed service
 * This is the primary data source that uses a single HTTP request
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with all composed lab data
 */
export const useAllLabsQuery = (options = {}) => {
  return useQuery({
    queryKey: ['labs', 'all-composed'],
    queryFn: () => labServices.fetchAllLabsComposed(),
    staleTime: 60 * 60 * 1000, // 60 minutes
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    refetchOnWindowFocus: false,
    refetchInterval: false,
    retry: 2,
    ...options,
  });
};

// === CACHE-EXTRACTING HOOKS (simple data operations) ===

/**
 * Hook to get basic lab list (extracts from composed data)
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with lab list data
 */
export const useLabListQuery = (options = {}) => {
  const allLabsQuery = useAllLabsQuery();
  
  return useMemo(() => {
    const labIds = allLabsQuery.data?.map(lab => lab.id) || [];
    return {
      data: labIds,
      isLoading: allLabsQuery.isLoading,
      isPending: allLabsQuery.isPending,
      isInitialLoading: allLabsQuery.isInitialLoading,
      isFetching: allLabsQuery.isFetching,
      isSuccess: allLabsQuery.isSuccess,
      isError: allLabsQuery.isError,
      error: allLabsQuery.error,
      ...options,
    };
  }, [allLabsQuery.data, allLabsQuery.isLoading, allLabsQuery.isPending, allLabsQuery.isInitialLoading, allLabsQuery.isFetching, allLabsQuery.isSuccess, allLabsQuery.isError, allLabsQuery.error, options]);
};

/**
 * Hook to get LAB token decimals (extracts from composed data)
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with LAB token decimals data
 */
export const useLabDecimalsQuery = (options = {}) => {
  const allLabsQuery = useAllLabsQuery();
  
  return useMemo(() => {
    // Extract decimals from first lab's price data (all labs use same decimals)
    const decimals = allLabsQuery.data?.[0]?.decimals || 18;
    return {
      data: decimals,
      isLoading: allLabsQuery.isLoading,
      isPending: allLabsQuery.isPending,
      isInitialLoading: allLabsQuery.isInitialLoading,
      isFetching: allLabsQuery.isFetching,
      isSuccess: allLabsQuery.isSuccess,
      isError: allLabsQuery.isError,
      error: allLabsQuery.error,
      ...options,
    };
  }, [allLabsQuery.data, allLabsQuery.isLoading, allLabsQuery.isPending, allLabsQuery.isInitialLoading, allLabsQuery.isFetching, allLabsQuery.isSuccess, allLabsQuery.isError, allLabsQuery.error, options]);
};

/**
 * Hook to get specific lab data (extracts from composed data)
 * @param {string|number} labId - Lab identifier
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with lab data
 */
export const useLabDataQuery = (labId, options = {}) => {
  const allLabsQuery = useAllLabsQuery();
  
  return useMemo(() => {
    const lab = allLabsQuery.data?.find(l => l.id?.toString() === labId?.toString());
    return {
      data: lab || null,
      isLoading: allLabsQuery.isLoading,
      isPending: allLabsQuery.isPending,
      isInitialLoading: allLabsQuery.isInitialLoading,
      isFetching: allLabsQuery.isFetching,
      isSuccess: allLabsQuery.isSuccess && !!lab,
      isError: allLabsQuery.isError,
      error: allLabsQuery.error,
      ...options,
    };
  }, [allLabsQuery.data, allLabsQuery.isLoading, allLabsQuery.isPending, allLabsQuery.isInitialLoading, allLabsQuery.isFetching, allLabsQuery.isSuccess, allLabsQuery.isError, allLabsQuery.error, labId, options]);
};

/**
 * Hook to get lab owner (extracts from composed data)
 * @param {string|number} labId - Lab identifier
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with lab owner data
 */
export const useLabOwnerQuery = (labId, options = {}) => {
  const allLabsQuery = useAllLabsQuery();
  
  return useMemo(() => {
    const lab = allLabsQuery.data?.find(l => l.id?.toString() === labId?.toString());
    const owner = lab?.owner || null;
    return {
      data: owner,
      isLoading: allLabsQuery.isLoading,
      isPending: allLabsQuery.isPending,
      isInitialLoading: allLabsQuery.isInitialLoading,
      isFetching: allLabsQuery.isFetching,
      isSuccess: allLabsQuery.isSuccess && !!owner,
      isError: allLabsQuery.isError,
      error: allLabsQuery.error,
      ...options,
    };
  }, [allLabsQuery.data, allLabsQuery.isLoading, allLabsQuery.isPending, allLabsQuery.isInitialLoading, allLabsQuery.isFetching, allLabsQuery.isSuccess, allLabsQuery.isError, allLabsQuery.error, labId, options]);
};

/**
 * Hook to get lab metadata (extracts from composed data)
 * @param {string} metadataUri - URI to fetch metadata from (not used in optimized version)
 * @param {string|number} labId - Lab identifier for context
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with lab metadata
 */
export const useLabMetadataQuery = (metadataUri, labId, options = {}) => {
  const allLabsQuery = useAllLabsQuery();
  
  return useMemo(() => {
    const lab = allLabsQuery.data?.find(l => l.id?.toString() === labId?.toString());
    // Return the complete lab object as metadata since it's already composed
    return {
      data: lab || null,
      isLoading: allLabsQuery.isLoading,
      isPending: allLabsQuery.isPending,
      isInitialLoading: allLabsQuery.isInitialLoading,
      isFetching: allLabsQuery.isFetching,
      isSuccess: allLabsQuery.isSuccess && !!lab,
      isError: allLabsQuery.isError,
      error: allLabsQuery.error,
      ...options,
    };
  }, [allLabsQuery.data, allLabsQuery.isLoading, allLabsQuery.isPending, allLabsQuery.isInitialLoading, allLabsQuery.isFetching, allLabsQuery.isSuccess, allLabsQuery.isError, allLabsQuery.error, labId, options]);
};

// === ATOMIC HOOKS (for specific use cases when individual data is needed) ===

/**
 * Hook to get basic lab list (atomic) - direct service call
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with lab list data
 */
export const useLabListQueryAtomic = (options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.LABS.list,
    queryFn: () => labServices.fetchLabList(),
    staleTime: 3 * 60 * 60 * 1000, // 3 hours (longer than composed)
    gcTime: 48 * 60 * 60 * 1000, // 48 hours
    retry: 2,
    ...options,
  });
};

/**
 * Hook to get LAB token decimals (atomic) - direct service call
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with LAB token decimals data
 */
export const useLabDecimalsQueryAtomic = (options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.LABS.decimals,
    queryFn: () => labServices.fetchLabDecimals(),
    staleTime: Infinity, // Never stale - permanent cache (immutable data)
    gcTime: Infinity, // Never garbage collected - permanent storage
    retry: 2,
    ...options,
  });
};

/**
 * Hook to get specific lab data (atomic) - direct service call
 * @param {string|number} labId - Lab identifier
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with lab data
 */
export const useLabDataQueryAtomic = (labId, options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.LABS.data(labId),
    queryFn: () => labServices.fetchLabData(labId),
    enabled: !!labId,
    staleTime: 3 * 60 * 60 * 1000, // 3 hours (individual data changes less)
    gcTime: 48 * 60 * 60 * 1000, // 48 hours
    retry: 2,
    ...options,
  });
};

/**
 * Hook to get lab owner (atomic) - direct service call
 * @param {string|number} labId - Lab identifier
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with lab owner data
 */
export const useLabOwnerQueryAtomic = (labId, options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.LABS.owner(labId),
    queryFn: () => labServices.fetchLabOwner(labId),
    enabled: !!labId,
    staleTime: 6 * 60 * 60 * 1000, // 24 hours (ownership rarely changes)
    gcTime: 48 * 60 * 60 * 1000, // 72 hours
    retry: 2,
    ...options,
  });
};

/**
 * Hook to get providers list (atomic) - direct service call
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with providers list data
 */
export const useProvidersListQueryAtomic = (options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.PROVIDERS.list,
    queryFn: () => labServices.fetchProvidersList(),
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
    gcTime: 7 * 24 * 60 * 60 * 1000, // 1 week
    retry: 2,
    ...options,
  });
};

/**
 * Hook to get lab metadata (atomic) - direct service call
 * @param {string} metadataUri - URI to fetch metadata from
 * @param {string|number} labId - Lab identifier for context
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with lab metadata
 */
export const useLabMetadataQueryAtomic = (metadataUri, labId, options = {}) => {
  return useQuery({
    queryKey: QUERY_KEYS.LABS.metadata(metadataUri),
    queryFn: () => labServices.fetchLabMetadata(metadataUri, labId),
    enabled: !!metadataUri,
    staleTime: 4 * 60 * 60 * 1000, // 4 hours (metadata changes less frequently)
    gcTime: 48 * 60 * 60 * 1000, // 48 hours
    retry: 2,
    ...options,
  });
};

// === CACHE MANAGEMENT ===

/**
 * Hook to manually invalidate lab cache and force refetch
 */
export const useLabCacheInvalidation = () => {
  const queryClient = useQueryClient();
  
  return {
    /**
     * Invalidate all lab queries (list, individual labs, etc.)
     */
    invalidateAllLabs: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.list });
      queryClient.invalidateQueries({ queryKey: ['labs'] }); // Invalidate all lab-related queries
    },
    
    /**
     * Alias for invalidateAllLabs (for consistency with event contexts)
     */
    invalidateLabList: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.list });
    },
    
    /**
     * Invalidate specific lab data
     * @param {string|number} labId - Lab ID
     */
    invalidateLabDetail: (labId) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.data(labId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.owner(labId) });
    },
    
    /**
     * Alias for invalidateLabDetail (for consistency with event contexts)
     * @param {string|number} labId - Lab ID
     */
    invalidateLabData: (labId) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.data(labId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.owner(labId) });
    },
    
    invalidateProviders: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.PROVIDERS.list });
    },
    
    // Force refetch without invalidation
    refetchAllLabs: () => {
      queryClient.refetchQueries({ queryKey: QUERY_KEYS.LABS.list });
    },
    
    refetchLabDetail: (labId) => {
      queryClient.refetchQueries({ queryKey: QUERY_KEYS.LABS.data(labId) });
    },
  };
};

// === MUTATIONS ===

/**
 * Hook to create a new lab
 */
export const useCreateLabMutation = () => {
  const queryClient = useQueryClient();
  const labCacheUpdates = useLabCacheUpdates();
  
  return useMutation({
    mutationFn: (labData) => labServices.createLab(labData),
    onSuccess: (createdLab, labData) => {
      // Try granular cache update first
      try {
        const labToAdd = {
          ...createdLab,
          ...labData,
          timestamp: new Date().toISOString()
        };
        labCacheUpdates.addLabToAllLabsCache(labToAdd);
        devLog.log('✅ Lab creation: granular cache update completed');
      } catch (error) {
        devLog.warn('⚠️ Granular lab creation update failed, falling back to invalidation:', error);
        // Fallback to traditional invalidation
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.list });
        queryClient.invalidateQueries({ queryKey: ['labs'] });
      }
    },
    onError: (error) => {
      devLog.error('Failed to create lab:', error);
    },
  });
};

/**
 * Hook to update a lab
 */
export const useUpdateLabMutation = () => {
  const queryClient = useQueryClient();
  const labCacheUpdates = useLabCacheUpdates();
  
  return useMutation({
    mutationFn: ({ labId, labData }) => labServices.updateLab(labId, labData),
    onSuccess: (updatedLab, variables) => {
      // Try granular cache update first
      try {
        const labUpdates = {
          ...updatedLab,
          ...variables.labData,
          timestamp: new Date().toISOString()
        };
        labCacheUpdates.updateLabInAllLabsCache(variables.labId, labUpdates);
        devLog.log('✅ Lab update: granular cache update completed');
      } catch (error) {
        devLog.warn('⚠️ Granular lab update failed, falling back to invalidation:', error);
        // Fallback to traditional invalidation
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.data(variables.labId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.list });
        queryClient.invalidateQueries({ queryKey: ['labs'] });
      }
    },
    onError: (error) => {
      devLog.error('Failed to update lab:', error);
    },
  });
};

/**
 * Hook to delete a lab
 */
export const useDeleteLabMutation = () => {
  const queryClient = useQueryClient();
  const labCacheUpdates = useLabCacheUpdates();
  
  return useMutation({
    mutationFn: (labId) => labServices.deleteLab(labId),
    onSuccess: (data, labId) => {
      // Try granular cache update first
      try {
        labCacheUpdates.removeLabFromAllLabsCache(labId);
        devLog.log('✅ Lab deletion: granular cache update completed');
      } catch (error) {
        devLog.warn('⚠️ Granular lab deletion update failed, falling back to invalidation:', error);
        // Fallback to traditional invalidation
        queryClient.removeQueries({ queryKey: QUERY_KEYS.LABS.data(labId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.list });
        queryClient.invalidateQueries({ queryKey: ['labs'] });
      }
    },
    onError: (error) => {
      devLog.error('Failed to delete lab:', error);
    },
  });
};

/**
 * Hook to toggle lab status (enable/disable)
 */
export const useToggleLabStatusMutation = () => {
  const queryClient = useQueryClient();
  const labCacheUpdates = useLabCacheUpdates();
  
  return useMutation({
    mutationFn: ({ labId, status }) => labServices.toggleLabStatus(labId, status),
    onSuccess: (data, variables) => {
      // Try granular cache update first
      try {
        const statusUpdate = {
          isActive: variables.status,
          timestamp: new Date().toISOString()
        };
        labCacheUpdates.updateLabInAllLabsCache(variables.labId, statusUpdate);
        devLog.log('✅ Lab status toggle: granular cache update completed');
      } catch (error) {
        devLog.warn('⚠️ Granular lab status update failed, falling back to invalidation:', error);
        // Fallback to traditional invalidation
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.data(variables.labId) });
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.list });
        queryClient.invalidateQueries({ queryKey: ['labs'] });
      }
    },
    onError: (error) => {
      devLog.error('Failed to toggle lab status:', error);
    },
  });
};

// ===============================
// === GRANULAR CACHE UPDATES FOR LABS ===
// ===============================

/**
 * Hook for lab-specific granular cache updates
 * @returns {Object} Lab cache update functions
 */
export const useLabCacheUpdates = () => {
  const queryClient = useQueryClient();

  /**
   * Update lab data in all labs cache without refetching everything
   * @param {string|number} labId - Lab ID
   * @param {Object} updates - Partial lab data updates
   */
  const updateLabInAllLabsCache = (labId, updates) => {
    if (!labId || !updates) return;

    // Update in composed labs cache (if it exists)
    const allLabsKey = ['labs', 'all-composed'];
    const currentLabsData = queryClient.getQueryData(allLabsKey);
    
    if (currentLabsData && Array.isArray(currentLabsData)) {
      const updatedLabs = currentLabsData.map(lab => 
        lab.id === labId ? { ...lab, ...updates } : lab
      );
      queryClient.setQueryData(allLabsKey, updatedLabs);
      devLog.log('🎯 Updated lab in all labs cache:', { labId, updates });
    }

    // Also update individual lab cache
    const labDataKey = QUERY_KEYS.LABS.data(labId);
    const currentLabData = queryClient.getQueryData(labDataKey);
    
    if (currentLabData) {
      queryClient.setQueryData(labDataKey, { ...currentLabData, ...updates });
      devLog.log('🎯 Updated individual lab cache:', { labId, updates });
    }
  };

  /**
   * Add a new lab to all labs cache without refetching everything
   * @param {Object} newLab - New lab data
   */
  const addLabToAllLabsCache = (newLab) => {
    if (!newLab || !newLab.id) return;

    const allLabsKey = ['labs', 'all-composed'];
    const currentLabsData = queryClient.getQueryData(allLabsKey);
    
    if (currentLabsData && Array.isArray(currentLabsData)) {
      queryClient.setQueryData(allLabsKey, [...currentLabsData, newLab]);
      devLog.log('🎯 Added lab to all labs cache:', { labId: newLab.id });
    }
  };

  /**
   * Remove a lab from all labs cache without refetching everything
   * @param {string|number} labId - Lab ID to remove
   */
  const removeLabFromAllLabsCache = (labId) => {
    if (!labId) return;

    const allLabsKey = ['labs', 'all-composed'];
    const currentLabsData = queryClient.getQueryData(allLabsKey);
    
    if (currentLabsData && Array.isArray(currentLabsData)) {
      const updatedLabs = currentLabsData.filter(lab => lab.id !== labId);
      queryClient.setQueryData(allLabsKey, updatedLabs);
      devLog.log('🎯 Removed lab from all labs cache:', { labId });
    }

    // Also remove individual lab cache
    queryClient.removeQueries({ queryKey: QUERY_KEYS.LABS.data(labId) });
  };

  /**
   * Smart lab invalidation - tries granular first, falls back to invalidation
   * @param {string|number} labId - Lab ID
   * @param {Object} [labData] - Lab data for granular updates
   * @param {string} [action] - Action type: 'add', 'remove', 'update'
   */
  const smartLabInvalidation = (labId, labData = null, action = null) => {
    // Try granular updates first if we have the data and action
    if (labData && action) {
      try {
        switch (action) {
          case 'add':
            addLabToAllLabsCache(labData);
            return; // Success, no need for invalidation
          case 'remove':
            removeLabFromAllLabsCache(labId);
            return; // Success, no need for invalidation
          case 'update':
            updateLabInAllLabsCache(labId, labData);
            return; // Success, no need for invalidation
        }
      } catch (error) {
        devLog.warn('⚠️ Granular lab update failed, falling back to invalidation:', error);
      }
    }

    // Fallback to traditional invalidation
    if (labId) {
      // Lab data
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.LABS.data(labId)
      });
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.LABS.owner(labId)
      });
      
      // Lab list (for new/deleted labs)
      queryClient.invalidateQueries({ 
        queryKey: QUERY_KEYS.LABS.list
      });
      
      devLog.log('🔄 Used fallback invalidation for lab data:', labId);
    }
  };

  return {
    updateLabInAllLabsCache,
    addLabToAllLabsCache,
    removeLabFromAllLabsCache,
    smartLabInvalidation
  };
};
