/**
 * React Query Hooks for Labs - Simplified Architecture
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
    staleTime: 5 * 60 * 1000, // 5 minutes
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
      error: allLabsQuery.error,
      isSuccess: allLabsQuery.isSuccess,
      ...options,
    };
  }, [allLabsQuery.data, allLabsQuery.isLoading, allLabsQuery.error, allLabsQuery.isSuccess, options]);
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
      error: allLabsQuery.error,
      isSuccess: allLabsQuery.isSuccess,
      ...options,
    };
  }, [allLabsQuery.data, allLabsQuery.isLoading, allLabsQuery.error, allLabsQuery.isSuccess, options]);
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
      error: allLabsQuery.error,
      isSuccess: allLabsQuery.isSuccess && !!lab,
      ...options,
    };
  }, [allLabsQuery.data, allLabsQuery.isLoading, allLabsQuery.error, allLabsQuery.isSuccess, labId, options]);
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
      error: allLabsQuery.error,
      isSuccess: allLabsQuery.isSuccess && !!owner,
      ...options,
    };
  }, [allLabsQuery.data, allLabsQuery.isLoading, allLabsQuery.error, allLabsQuery.isSuccess, labId, options]);
};

/**
 * Hook to get providers list (extracts from composed data)
 * @param {Object} [options={}] - Additional react-query options
 * @returns {Object} React Query result with providers list data
 */
export const useProvidersListQuery = (options = {}) => {
  const allLabsQuery = useAllLabsQuery();
  
  return useMemo(() => {
    const providers = [...new Set(allLabsQuery.data?.map(lab => lab.provider).filter(Boolean))] || [];
    return {
      data: providers,
      isLoading: allLabsQuery.isLoading,
      error: allLabsQuery.error,
      isSuccess: allLabsQuery.isSuccess,
      ...options,
    };
  }, [allLabsQuery.data, allLabsQuery.isLoading, allLabsQuery.error, allLabsQuery.isSuccess, options]);
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
      error: allLabsQuery.error,
      isSuccess: allLabsQuery.isSuccess && !!lab,
      ...options,
    };
  }, [allLabsQuery.data, allLabsQuery.isLoading, allLabsQuery.error, allLabsQuery.isSuccess, labId, options]);
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
    staleTime: 12 * 60 * 60 * 1000, // 12 hours
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
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
    staleTime: 24 * 60 * 60 * 1000, // 24 hours (very stable)
    gcTime: 48 * 60 * 60 * 1000, // 48 hours
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
    staleTime: 12 * 60 * 60 * 1000, // 12 hours
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
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
    staleTime: 6 * 60 * 60 * 1000, // 6 hours (can change)
    gcTime: 12 * 60 * 60 * 1000, // 12 hours
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
    staleTime: 12 * 60 * 60 * 1000, // 12 hours
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
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
    staleTime: 12 * 60 * 60 * 1000, // 12 hours
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
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
    invalidateAllLabs: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.list });
      queryClient.invalidateQueries({ queryKey: ['labs'] }); // Invalidate all lab-related queries
    },
    
    invalidateLabDetail: (labId) => {
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
  
  return useMutation({
    mutationFn: (labData) => labServices.createLab(labData),
    onSuccess: () => {
      // Invalidate relevant queries after successful creation
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.list });
      queryClient.invalidateQueries({ queryKey: ['labs'] });
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
  
  return useMutation({
    mutationFn: ({ labId, labData }) => labServices.updateLab(labId, labData),
    onSuccess: (data, variables) => {
      // Invalidate specific lab and list
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.data(variables.labId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.list });
      queryClient.invalidateQueries({ queryKey: ['labs'] });
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
  
  return useMutation({
    mutationFn: (labId) => labServices.deleteLab(labId),
    onSuccess: (data, labId) => {
      // Remove specific lab from cache and invalidate list
      queryClient.removeQueries({ queryKey: QUERY_KEYS.LABS.data(labId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.list });
      queryClient.invalidateQueries({ queryKey: ['labs'] });
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
  
  return useMutation({
    mutationFn: ({ labId, status }) => labServices.toggleLabStatus(labId, status),
    onSuccess: (data, variables) => {
      // Invalidate specific lab and list
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.data(variables.labId) });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.LABS.list });
      queryClient.invalidateQueries({ queryKey: ['labs'] });
    },
    onError: (error) => {
      devLog.error('Failed to toggle lab status:', error);
    },
  });
};
